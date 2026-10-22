import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { ApiError, productsApi, reservationsApi } from '../api/client';
import CartScreen from '../app/(customer)/cart';
import type { CartLine } from '../cart/cart';
import { CartProvider } from '../cart/CartContext';
import { loadCheckout } from '../cart/checkout';
import { mockRouter, setMockParams } from '../test-utils/expoRouterMock';
import { product, reservation } from '../test-utils/fixtures';
import { clearMemoryStore, loadJson, saveJson } from '../utils/storage';

jest.mock('expo-router', () => require('../test-utils/expoRouterMock'));

const lamp = product();
const bulb = product({ id: 2, sku: 'BULB-1', name: 'Bulb', unitPrice: 2.5 });
const lampLine: CartLine = { productId: 1, sku: 'LAMP-001', name: 'Desk lamp', unitPrice: 19.95, quantity: 2 };
const bulbLine: CartLine = { productId: 2, sku: 'BULB-1', name: 'Bulb', unitPrice: 2.5, quantity: 3 };
const request = {
    items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 3 },
    ],
};
const reserved = reservation({
    total: 47.4,
    items: [
        { productId: 1, quantity: 2, unitPrice: 19.95, lineTotal: 39.9 },
        { productId: 2, quantity: 3, unitPrice: 2.5, lineTotal: 7.5 },
    ],
});

beforeEach(() => {
    jest.restoreAllMocks();
    clearMemoryStore();
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    setMockParams({});
    jest.spyOn(productsApi, 'list').mockResolvedValue([lamp, bulb]);
    // Lines are added in the opposite order to the request, which is sorted by product id.
    saveJson('inventory-orders.cart', [bulbLine, lampLine]);
});

const renderCart = () =>
    render(
        <CartProvider>
            <CartScreen />
        </CartProvider>
    );

const checkOut = async () => fireEvent.press(screen.getByRole('button', { name: 'Check out' }));

describe('Cart screen', () => {
    it('shows unit prices, line totals and the total, and edits quantities', async () => {
        await renderCart();

        const lampRow = await screen.findByTestId('cart-line-LAMP-001');
        expect(within(lampRow).getByText('SKU LAMP-001 · 19.95 each')).toBeTruthy();
        expect(within(lampRow).getByText('39.90')).toBeTruthy();
        expect(screen.getByText('Estimated total 47.40')).toBeTruthy();

        await fireEvent.changeText(within(lampRow).getByLabelText('Quantity of LAMP-001'), '4');
        expect(screen.getByText('Estimated total 87.30')).toBeTruthy();
        await fireEvent.press(screen.getByRole('button', { name: 'Increase BULB-1' }));
        await fireEvent.press(screen.getByRole('button', { name: 'Increase BULB-1' }));
        await fireEvent.press(screen.getByRole('button', { name: 'Decrease BULB-1' }));
        expect(within(screen.getByTestId('cart-line-BULB-1')).getByText('10.00')).toBeTruthy();

        await fireEvent.changeText(within(lampRow).getByLabelText('Quantity of LAMP-001'), '0');
        expect(screen.getByText('Must be between 1 and 10000')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Check out' })).toBeDisabled();

        await fireEvent.press(screen.getByRole('button', { name: 'Remove LAMP-001' }));
        expect(screen.queryByTestId('cart-line-LAMP-001')).toBeNull();
        expect(screen.getByText('Estimated total 10.00')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Check out' })).toBeEnabled();
    });

    it('clears the cart after confirmation', async () => {
        await renderCart();
        await fireEvent.press(await screen.findByRole('button', { name: 'Clear cart' }));
        await fireEvent.press(within(screen.getByLabelText('Clear the cart?')).getByRole('button', { name: 'Clear cart' }));

        expect(screen.getByText('Your cart is empty.')).toBeTruthy();
        expect(loadJson('inventory-orders.cart')).toEqual([]);
    });

    it('reserves the whole cart in one request, locks it and opens the checkout', async () => {
        const create = jest.spyOn(reservationsApi, 'create').mockResolvedValue(reserved);
        await renderCart();
        await screen.findByTestId('cart-line-LAMP-001');

        await checkOut();

        expect(create).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith(request, expect.any(String));
        expect(loadCheckout()).toMatchObject({ idempotencyKey: create.mock.calls[0][1], reservationId: 3 });
        expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/checkout/[id]', params: { id: '3' } });
        // The cart stays until payment is confirmed, but can no longer be edited or checked out again.
        expect(loadJson('inventory-orders.cart')).toHaveLength(2);
        expect(screen.getByTestId('checkout-locked')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Check out' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Clear cart' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Remove LAMP-001' })).toBeNull();
        expect(screen.queryByLabelText('Quantity of LAMP-001')).toBeNull();
        expect(within(screen.getByTestId('cart-line-LAMP-001')).getByText('Quantity 2')).toBeTruthy();
    });

    it('shows insufficient stock clearly and lets the customer revise the cart', async () => {
        jest.spyOn(reservationsApi, 'create').mockRejectedValue(
            new ApiError(409, 'INSUFFICIENT_STOCK', 'Insufficient stock for product 2: requested 3, available 1')
        );
        await renderCart();
        await screen.findByTestId('cart-line-LAMP-001');
        jest.spyOn(productsApi, 'list').mockResolvedValue([lamp, { ...bulb, stock: { onHand: 1, reserved: 0, available: 1 } }]);

        await checkOut();

        expect(
            screen.getByText(/Insufficient stock for product 2: requested 3, available 1\. Nothing was reserved/)
        ).toBeTruthy();
        expect(within(screen.getByTestId('cart-line-BULB-1')).getByText('Only 1 available')).toBeTruthy();
        expect(mockRouter.replace).not.toHaveBeenCalled();
        // A definite rejection reserved nothing, so the cart is not locked.
        expect(loadCheckout()).toBeUndefined();

        await fireEvent.changeText(screen.getByLabelText('Quantity of BULB-1'), '1');
        expect(within(screen.getByTestId('cart-line-BULB-1')).queryByText('Only 1 available')).toBeNull();
    });

    it('keeps the cart locked after an unanswered checkout and retries with the same idempotency key', async () => {
        const create = jest
            .spyOn(reservationsApi, 'create')
            .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the backend.'))
            .mockResolvedValue(reserved);
        await renderCart();
        await screen.findByTestId('cart-line-LAMP-001');

        await checkOut();
        expect(screen.getByText(/Your cart may already be reserved/)).toBeTruthy();
        expect(screen.getByTestId('checkout-unconfirmed')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Check out' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Remove LAMP-001' })).toBeNull();
        expect(mockRouter.replace).not.toHaveBeenCalled();

        await fireEvent.press(screen.getByRole('button', { name: 'Retry checkout' }));

        expect(create).toHaveBeenCalledTimes(2);
        expect(create.mock.calls[1]).toEqual([request, create.mock.calls[0][1]]);
        expect(mockRouter.replace).toHaveBeenCalledTimes(1);
        expect(loadCheckout()?.reservationId).toBe(3);
    });

    it('keeps an unanswered checkout locked across a reload', async () => {
        jest.spyOn(reservationsApi, 'create').mockRejectedValue(new ApiError(503, 'UNAVAILABLE', 'Down.'));
        await renderCart();
        await screen.findByTestId('cart-line-LAMP-001');
        await checkOut();
        await screen.unmount();

        await renderCart();
        expect(await screen.findByTestId('checkout-unconfirmed')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Retry checkout' })).toBeTruthy();
        expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('retries retryable backend errors automatically with the same key', async () => {
        const create = jest
            .spyOn(reservationsApi, 'create')
            .mockRejectedValueOnce(new ApiError(409, 'LOCK_CONFLICT', 'Busy.', [], true))
            .mockResolvedValue(reserved);
        await renderCart();
        await screen.findByTestId('cart-line-LAMP-001');

        await checkOut();
        await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledTimes(1));

        expect(create).toHaveBeenCalledTimes(2);
        expect(create.mock.calls[1][1]).toBe(create.mock.calls[0][1]);
    });

    it('opens the active checkout instead of the cart, e.g. after a refresh, without reserving again', async () => {
        const create = jest.spyOn(reservationsApi, 'create').mockResolvedValue(reserved);
        await renderCart();
        await screen.findByTestId('cart-line-LAMP-001');
        await checkOut();
        await screen.unmount();
        mockRouter.replace.mockClear();

        // A fresh mount reads the cart and the checkout record from storage, as after a reload.
        await renderCart();

        expect(mockRouter.replace).toHaveBeenCalledTimes(1);
        expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/checkout/[id]', params: { id: '3' } });
        expect(create).toHaveBeenCalledTimes(1);
    });

    it('starts a new attempt when the same cart was previously reserved and that reservation expired', async () => {
        const create = jest
            .spyOn(reservationsApi, 'create')
            .mockResolvedValueOnce(reservation({ status: 'EXPIRED' }))
            .mockResolvedValueOnce(reservation({ id: 4 }));
        await renderCart();
        await screen.findByTestId('cart-line-LAMP-001');

        await checkOut();

        expect(create).toHaveBeenCalledTimes(2);
        expect(create.mock.calls[1][1]).not.toBe(create.mock.calls[0][1]);
        expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/checkout/[id]', params: { id: '4' } });
    });

    it.each([
        ['expired', /Reservation #3 expired before payment was confirmed/],
        ['cancelled', /Checkout cancelled: reservation #3 was released/],
    ])('explains a %s checkout and leaves the cart editable', async (closed, text) => {
        setMockParams({ closed, reservation: '3' });
        await renderCart();

        expect(await screen.findByText(text)).toBeTruthy();
        expect(mockRouter.replace).not.toHaveBeenCalled();
        expect(screen.queryByTestId('checkout-locked')).toBeNull();
        expect(screen.getByRole('button', { name: 'Check out' })).toBeEnabled();
        await fireEvent.press(screen.getByRole('button', { name: 'Increase LAMP-001' }));
        expect((loadJson('inventory-orders.cart') as CartLine[]).find((l) => l.productId === 1)?.quantity).toBe(3);
    });
});
