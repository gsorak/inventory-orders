import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { productsApi } from '../api/client';
import ShopScreen from '../app/(customer)/shop';
import { CartProvider } from '../cart/CartContext';
import { product } from '../test-utils/fixtures';
import { clearMemoryStore, loadJson, saveJson } from '../utils/storage';

jest.mock('expo-router', () => require('../test-utils/expoRouterMock'));

const lamp = product({ stock: { onHand: 5, reserved: 0, available: 5 } });
const bulb = product({ id: 2, sku: 'BULB-1', name: 'Bulb', unitPrice: 2.5 });
const vase = product({ id: 3, sku: 'VASE-9', name: 'Vase', stock: { onHand: 2, reserved: 2, available: 0 } });

beforeEach(() => {
    jest.restoreAllMocks();
    clearMemoryStore();
    jest.spyOn(productsApi, 'list').mockResolvedValue([lamp, bulb, vase]);
});

const renderShop = () =>
    render(
        <CartProvider>
            <ShopScreen />
        </CartProvider>
    );

describe('Shop screen', () => {
    it('does not add to the cart while a checkout is in progress', async () => {
        saveJson('inventory-orders.checkout', { request: '{"items":[]}', idempotencyKey: 'k', reservationId: 3 });
        await renderShop();

        expect(await screen.findByTestId('shop-locked')).toHaveTextContent(/Your cart is locked while your checkout is in progress/);
        expect(screen.getByTestId('shop-product-LAMP-001')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Add LAMP-001 to cart' })).toBeNull();
    });

    it('shows name, SKU, price and availability, and marks unavailable products', async () => {
        await renderShop();

        const lampCard = await screen.findByTestId('shop-product-LAMP-001');
        expect(within(lampCard).getByText('Desk lamp')).toBeTruthy();
        expect(within(lampCard).getByText('SKU LAMP-001')).toBeTruthy();
        expect(within(lampCard).getByText('19.95')).toBeTruthy();
        expect(within(lampCard).getByLabelText('5 available')).toBeTruthy();

        const vaseCard = screen.getByTestId('shop-product-VASE-9');
        expect(within(vaseCard).getByLabelText('Out of stock')).toBeTruthy();
        expect(within(vaseCard).queryByRole('button', { name: 'Add VASE-9 to cart' })).toBeNull();
    });

    it('searches by name or SKU', async () => {
        await renderShop();
        await screen.findByTestId('shop-product-LAMP-001');

        await fireEvent.changeText(screen.getByLabelText('Search products'), 'bulb-');
        expect(screen.getByTestId('shop-product-BULB-1')).toBeTruthy();
        expect(screen.queryByTestId('shop-product-LAMP-001')).toBeNull();

        await fireEvent.changeText(screen.getByLabelText('Search products'), 'LAMP');
        expect(screen.getByTestId('shop-product-LAMP-001')).toBeTruthy();

        await fireEvent.changeText(screen.getByLabelText('Search products'), 'sofa');
        expect(screen.getByText('No products match "sofa".')).toBeTruthy();
    });

    it('adds several products to the persisted cart without reserving anything', async () => {
        await renderShop();
        await fireEvent.changeText(await screen.findByLabelText('Quantity of LAMP-001'), '2');
        await fireEvent.press(screen.getByRole('button', { name: 'Add LAMP-001 to cart' }));
        await fireEvent.press(screen.getByRole('button', { name: 'Add BULB-1 to cart' }));

        expect(screen.getByText('Added 1 × Bulb to your cart.')).toBeTruthy();
        expect(within(screen.getByTestId('shop-product-LAMP-001')).getByText('2 in your cart')).toBeTruthy();
        expect(screen.getByText('View cart (2 products) →')).toBeTruthy();
        expect(loadJson('inventory-orders.cart')).toEqual([
            { productId: 1, sku: 'LAMP-001', name: 'Desk lamp', unitPrice: 19.95, quantity: 2 },
            { productId: 2, sku: 'BULB-1', name: 'Bulb', unitPrice: 2.5, quantity: 1 },
        ]);
    });

    it('does not add more than is available, counting what is already in the cart', async () => {
        await renderShop();
        await fireEvent.changeText(await screen.findByLabelText('Quantity of LAMP-001'), '4');
        await fireEvent.press(screen.getByRole('button', { name: 'Add LAMP-001 to cart' }));

        await fireEvent.changeText(screen.getByLabelText('Quantity of LAMP-001'), '2');
        await fireEvent.press(screen.getByRole('button', { name: 'Add LAMP-001 to cart' }));
        expect(screen.getByText('Only 1 more available')).toBeTruthy();

        await fireEvent.changeText(screen.getByLabelText('Quantity of LAMP-001'), '0');
        await fireEvent.press(screen.getByRole('button', { name: 'Add LAMP-001 to cart' }));
        expect(screen.getByText('Must be between 1 and 10000')).toBeTruthy();
        expect(within(screen.getByTestId('shop-product-LAMP-001')).getByText('4 in your cart')).toBeTruthy();
    });

    it('labels the quantity "Quantity" visibly while the input still names its product', async () => {
        await renderShop();
        const lampCard = await screen.findByTestId('shop-product-LAMP-001');

        expect(within(lampCard).getByText('Quantity')).toBeTruthy();
        expect(within(lampCard).getByLabelText('Quantity of LAMP-001')).toBeTruthy();
        expect(screen.queryByText(/Quantity of/)).toBeNull();
    });

    it('accepts only digits in the quantity', async () => {
        await renderShop();
        const quantity = await screen.findByLabelText('Quantity of LAMP-001');

        await fireEvent.changeText(quantity, '2a');
        await fireEvent.changeText(quantity, '1.5');
        await fireEvent.changeText(quantity, '-3');
        expect(screen.getByLabelText('Quantity of LAMP-001').props.value).toBe('1');
        await fireEvent.changeText(quantity, '3');
        expect(screen.getByLabelText('Quantity of LAMP-001').props.value).toBe('3');
    });

    it('gives every card the same width, sized to the columns that fit, even in a short last row', async () => {
        await renderShop();
        await screen.findByTestId('shop-product-LAMP-001');
        const layout = (width: number) => fireEvent(screen.getByTestId('shop-grid'), 'layout', { nativeEvent: { layout: { width } } });
        const widths = () => ['LAMP-001', 'BULB-1', 'VASE-9'].map((sku) => StyleSheet.flatten(screen.getByTestId(`shop-product-${sku}`).props.style).width);

        await layout(1134); // desktop: 4 columns
        expect(widths()).toEqual([274, 274, 274]);
        await layout(702); // tablet: 2 columns, the third card keeps the column width
        expect(widths()).toEqual([345, 345, 345]);
        await layout(324); // phone: 1 column
        expect(widths()).toEqual([324, 324, 324]);
    });

    it('shows a dismissible added-to-cart notification', async () => {
        await renderShop();
        await fireEvent.press(await screen.findByRole('button', { name: 'Add BULB-1 to cart' }));

        expect(screen.getByTestId('banner-success')).toHaveTextContent(/Added 1 × Bulb to your cart\./);
        await fireEvent.press(screen.getByRole('button', { name: 'Dismiss message' }));
        expect(screen.queryByTestId('banner-success')).toBeNull();
    });
});
