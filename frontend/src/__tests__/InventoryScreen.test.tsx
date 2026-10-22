import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { ApiError, productsApi } from '../api/client';
import InventoryScreen from '../app/admin/inventory';
import { product } from '../test-utils/fixtures';

jest.mock('expo-router', () => require('../test-utils/expoRouterMock'));

beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(productsApi, 'demoCatalog').mockResolvedValue(null);
});

async function fillProductForm(values: { sku: string; name: string; price: string; threshold: string }) {
    await fireEvent.changeText(screen.getByLabelText('SKU'), values.sku);
    await fireEvent.changeText(screen.getByLabelText('Name'), values.name);
    await fireEvent.changeText(screen.getByLabelText('Unit price'), values.price);
    await fireEvent.changeText(screen.getByLabelText('Low-stock threshold'), values.threshold);
}

describe('Inventory screen', () => {
    it('shows products with their stock levels and low-stock indicators', async () => {
        jest.spyOn(productsApi, 'list').mockResolvedValue([
            product({ stock: { onHand: 10, reserved: 2, available: 8 } }),
            product({ id: 2, sku: 'LOW-1', name: 'Low', lowStockThreshold: 5, stock: { onHand: 4, reserved: 1, available: 3 } }),
            product({ id: 3, sku: 'OUT-1', name: 'Out', stock: { onHand: 0, reserved: 0, available: 0 } }),
        ]);

        await render(<InventoryScreen />);

        const row = await screen.findByTestId('product-LAMP-001');
        expect(within(row).getByLabelText('On hand 10')).toBeTruthy();
        expect(within(row).getByLabelText('Reserved 2')).toBeTruthy();
        expect(within(row).getByLabelText('Available 8')).toBeTruthy();
        expect(within(row).getByText('In stock')).toBeTruthy();
        expect(within(screen.getByTestId('product-LOW-1')).getByText('Low stock')).toBeTruthy();
        expect(within(screen.getByTestId('product-OUT-1')).getByText('Out of stock')).toBeTruthy();
        expect(screen.getByText('3 products · 2 at or below their low-stock threshold')).toBeTruthy();
    });

    it('does not show the product or receipt forms until a dialog is opened', async () => {
        jest.spyOn(productsApi, 'list').mockResolvedValue([product()]);
        await render(<InventoryScreen />);

        await screen.findByTestId('product-LAMP-001');
        expect(screen.queryByLabelText('SKU')).toBeNull();
        expect(screen.queryByLabelText('Quantity received')).toBeNull();
    });

    it('filters products by name or SKU', async () => {
        jest.spyOn(productsApi, 'list').mockResolvedValue([
            product(),
            product({ id: 2, sku: 'CABLE-1', name: 'USB cable' }),
        ]);
        await render(<InventoryScreen />);
        await screen.findByTestId('product-LAMP-001');

        await fireEvent.changeText(screen.getByLabelText('Search products'), 'usb');
        expect(screen.queryByTestId('product-LAMP-001')).toBeNull();
        expect(screen.getByTestId('product-CABLE-1')).toBeTruthy();

        await fireEvent.changeText(screen.getByLabelText('Search products'), 'lamp-0');
        expect(screen.getByTestId('product-LAMP-001')).toBeTruthy();
        expect(screen.queryByTestId('product-CABLE-1')).toBeNull();

        await fireEvent.changeText(screen.getByLabelText('Search products'), 'nothing');
        expect(screen.getByText('No products match "nothing".')).toBeTruthy();
    });

    it('shows an empty state and a load error with retry', async () => {
        const list = jest
            .spyOn(productsApi, 'list')
            .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the backend.'))
            .mockResolvedValueOnce([]);

        await render(<InventoryScreen />);

        expect(await screen.findByText('Could not reach the backend.')).toBeTruthy();
        await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('No products yet. Use Add product to create one.')).toBeTruthy();
        expect(list).toHaveBeenCalledTimes(2);
    });

    it('validates the product form before calling the backend', async () => {
        jest.spyOn(productsApi, 'list').mockResolvedValue([]);
        const create = jest.spyOn(productsApi, 'create');
        await render(<InventoryScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Add product' }));
        await fillProductForm({ sku: '', name: 'Lamp', price: '0', threshold: '' });
        await fireEvent.press(screen.getByRole('button', { name: 'Create product' }));

        expect(screen.getAllByText('Required')).toHaveLength(2);
        expect(screen.getByText('Must be at least 0.01')).toBeTruthy();
        expect(create).not.toHaveBeenCalled();
    });

    it('ignores edits that would make the price or threshold malformed', async () => {
        jest.spyOn(productsApi, 'list').mockResolvedValue([]);
        await render(<InventoryScreen />);
        await fireEvent.press(await screen.findByRole('button', { name: 'Add product' }));
        const price = () => screen.getByLabelText('Unit price');
        const threshold = () => screen.getByLabelText('Low-stock threshold');

        for (const text of ['2', '23', '23.', '23.4', '23.44', '23.44.', '23.444', '23.44.4']) {
            await fireEvent.changeText(price(), text);
        }
        expect(price().props.value).toBe('23.44');
        await fireEvent.changeText(price(), '7,5');
        expect(price().props.value).toBe('7.5');

        await fireEvent.changeText(threshold(), '5x');
        await fireEvent.changeText(threshold(), '-1');
        await fireEvent.changeText(threshold(), '1.5');
        expect(threshold().props.value).toBe('5');
        expect(screen.getByLabelText('SKU').props.maxLength).toBe(64);
    });

    it('creates a product in a dialog, closes it and refreshes the list', async () => {
        const created = product({ id: 9, sku: 'NEW-1', name: 'New', stock: { onHand: 0, reserved: 0, available: 0 } });
        const list = jest.spyOn(productsApi, 'list').mockResolvedValueOnce([]).mockResolvedValueOnce([created]);
        const create = jest.spyOn(productsApi, 'create').mockResolvedValue(created);
        await render(<InventoryScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Add product' }));
        await fillProductForm({ sku: ' NEW-1 ', name: 'New', price: '2.50', threshold: '3' });
        await fireEvent.press(screen.getByRole('button', { name: 'Create product' }));

        expect(create).toHaveBeenCalledWith({ sku: 'NEW-1', name: 'New', unitPrice: 2.5, lowStockThreshold: 3 });
        expect(await screen.findByText('Product NEW-1 created. Receive stock to make it available.')).toBeTruthy();
        expect(await screen.findByTestId('product-NEW-1')).toBeTruthy();
        expect(screen.queryByLabelText('SKU')).toBeNull();
        expect(list).toHaveBeenCalledTimes(2);
    });

    it('creates a product with the default low-stock threshold and only shows a hint for the price', async () => {
        const created = product({ id: 9, sku: 'NEW-2', name: 'New', stock: { onHand: 0, reserved: 0, available: 0 } });
        jest.spyOn(productsApi, 'list').mockResolvedValue([]);
        const create = jest.spyOn(productsApi, 'create').mockResolvedValue(created);
        await render(<InventoryScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Add product' }));
        expect(screen.getByLabelText('Low-stock threshold').props.value).toBe('5');
        expect(screen.getByLabelText('Unit price').props.value).toBe('');
        expect(screen.getByLabelText('Unit price').props.placeholder).toBe('e.g. 19.99');

        await fireEvent.press(screen.getByRole('button', { name: 'Create product' }));
        expect(screen.getAllByText('Required')).toHaveLength(3);
        expect(create).not.toHaveBeenCalled();

        await fireEvent.changeText(screen.getByLabelText('SKU'), 'NEW-2');
        await fireEvent.changeText(screen.getByLabelText('Name'), 'New');
        await fireEvent.changeText(screen.getByLabelText('Unit price'), '19.99');
        await fireEvent.press(screen.getByRole('button', { name: 'Create product' }));
        expect(create).toHaveBeenCalledWith({ sku: 'NEW-2', name: 'New', unitPrice: 19.99, lowStockThreshold: 5 });
    });

    it('keeps the dialog open with backend errors such as a duplicate SKU', async () => {
        jest.spyOn(productsApi, 'list').mockResolvedValue([]);
        jest
            .spyOn(productsApi, 'create')
            .mockRejectedValue(new ApiError(409, 'ALREADY_EXISTS', 'Product with SKU LAMP-001 already exists'));
        await render(<InventoryScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Add product' }));
        await fillProductForm({ sku: 'LAMP-001', name: 'Lamp', price: '1', threshold: '0' });
        await fireEvent.press(screen.getByRole('button', { name: 'Create product' }));

        const dialog = screen.getByTestId('dialog');
        expect(await within(dialog).findByText('Product with SKU LAMP-001 already exists')).toBeTruthy();
        expect(within(dialog).getByLabelText('SKU').props.value).toBe('LAMP-001');
    });

    it('in the public demo, offers products from the demo catalogue instead of free-text SKU and name', async () => {
        const created = product({ id: 9, sku: 'CAM-HD', name: 'HD webcam', stock: { onHand: 0, reserved: 0, available: 0 } });
        jest.spyOn(productsApi, 'list').mockResolvedValue([]);
        jest.spyOn(productsApi, 'demoCatalog').mockResolvedValue([
            { sku: 'KB-MECH', name: 'Mechanical keyboard' },
            { sku: 'CAM-HD', name: 'HD webcam' },
        ]);
        const create = jest.spyOn(productsApi, 'create').mockResolvedValue(created);
        await render(<InventoryScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Add product' }));
        expect(screen.queryByLabelText('SKU')).toBeNull();
        expect(screen.queryByLabelText('Name')).toBeNull();
        await fireEvent.changeText(screen.getByLabelText('Unit price'), '49.90');
        await fireEvent.press(screen.getByRole('button', { name: 'Create product' }));
        expect(screen.getByText('Choose a product')).toBeTruthy();
        expect(create).not.toHaveBeenCalled();

        await fireEvent.press(screen.getByLabelText('Demo product: HD webcam (CAM-HD)'));
        await fireEvent.press(screen.getByRole('button', { name: 'Create product' }));
        expect(create).toHaveBeenCalledWith({ sku: 'CAM-HD', name: 'HD webcam', unitPrice: 49.9, lowStockThreshold: 5 });
    });

    it('in the public demo, explains when every catalogue product has been added', async () => {
        jest.spyOn(productsApi, 'list').mockResolvedValue([]);
        jest.spyOn(productsApi, 'demoCatalog').mockResolvedValue([]);
        await render(<InventoryScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Add product' }));
        expect(screen.getByText(/Every product of the demo catalogue has been added/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Create product' })).toBeNull();
        expect(screen.queryByLabelText('Unit price')).toBeNull();
    });

    it('closes the dialog without creating anything on cancel', async () => {
        jest.spyOn(productsApi, 'list').mockResolvedValue([]);
        const create = jest.spyOn(productsApi, 'create');
        await render(<InventoryScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Add product' }));
        await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.queryByTestId('dialog')).toBeNull();
        expect(create).not.toHaveBeenCalled();
    });

    it('receives stock for a product in a dialog', async () => {
        const before = product();
        const after = product({ stock: { onHand: 15, reserved: 0, available: 15 } });
        jest.spyOn(productsApi, 'list').mockResolvedValueOnce([before]).mockResolvedValueOnce([after]);
        const receive = jest.spyOn(productsApi, 'receiveStock').mockResolvedValue({
            id: 1,
            productId: 1,
            quantity: 5,
            source: 'PURCHASE',
            receivedAt: '2026-01-01T00:00:00Z',
            stock: after.stock,
        });
        await render(<InventoryScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Receive stock for LAMP-001' }));
        await fireEvent.changeText(screen.getByLabelText('Quantity received'), '0');
        await fireEvent.press(screen.getByRole('button', { name: 'Receive' }));
        expect(screen.getByText('Must be between 1 and 1000000')).toBeTruthy();
        expect(receive).not.toHaveBeenCalled();

        await fireEvent.changeText(screen.getByLabelText('Quantity received'), '5');
        await fireEvent.press(screen.getByRole('button', { name: 'Receive' }));

        expect(receive).toHaveBeenCalledWith(1, 5);
        expect(await screen.findByText('Received 5 units of LAMP-001. On hand is now 15, available 15.')).toBeTruthy();
        expect(screen.queryByTestId('dialog')).toBeNull();
        expect(within(screen.getByTestId('product-LAMP-001')).getByLabelText('On hand 15')).toBeTruthy();
    });
});
