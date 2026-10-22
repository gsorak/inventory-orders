import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { ApiError, ordersApi, productsApi, shipmentsApi } from '../api/client';
import type { OrderReturn } from '../api/types';
import CustomerOrderDetailsScreen from '../app/(customer)/orders/[id]';
import OrderDetailsScreen from '../app/admin/orders/[id]';
import { setMockParams } from '../test-utils/expoRouterMock';
import { order, orderItem, product, shipment } from '../test-utils/fixtures';

jest.mock('expo-router', () => require('../test-utils/expoRouterMock'));

beforeEach(() => {
    jest.restoreAllMocks();
    setMockParams({ id: '7' });
    jest.spyOn(productsApi, 'list').mockResolvedValue([product()]);
    jest.spyOn(ordersApi, 'returns').mockResolvedValue([]);
});

const deliveredOrder = () =>
    order({
        status: 'DELIVERED',
        deliveredAt: '2026-01-02T10:00:00Z',
        items: [orderItem({ packedQuantity: 3, shippedQuantity: 3, deliveredQuantity: 3 })],
    });

describe('Order details screen', () => {
    it('shows the order, a confirmation after payment and the next actions', async () => {
        setMockParams({ id: '7', confirmed: '1' });
        jest.spyOn(ordersApi, 'get').mockResolvedValue(order());
        jest.spyOn(ordersApi, 'shipments').mockResolvedValue([]);

        await render(<OrderDetailsScreen />);

        expect(await screen.findByText('Order #7')).toBeTruthy();
        expect(screen.getByText('Order: Confirmed')).toBeTruthy();
        expect(screen.getByText('Payment confirmed: order #7 was created.')).toBeTruthy();
        const actions = screen.getByTestId('next-actions');
        expect(within(actions).getByText(/Pack a shipment. Pack fewer units than ordered/)).toBeTruthy();
        expect(within(actions).getByRole('button', { name: 'Pack shipment…' })).toBeTruthy();
        expect(within(actions).queryByRole('button', { name: 'Record return…' })).toBeNull();
    });

    it('keeps the fulfilment forms closed until an action opens them', async () => {
        jest.spyOn(ordersApi, 'get').mockResolvedValue(order());
        jest.spyOn(ordersApi, 'shipments').mockResolvedValue([]);

        await render(<OrderDetailsScreen />);
        await screen.findByText('Order #7');

        expect(screen.queryByLabelText(/Units to pack/)).toBeNull();
        expect(screen.queryByLabelText(/Quantity to return/)).toBeNull();
    });

    it('reports an unknown order', async () => {
        jest.spyOn(ordersApi, 'get').mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Order 7 not found'));
        jest.spyOn(ordersApi, 'shipments').mockResolvedValue([]);

        await render(<OrderDetailsScreen />);

        expect(await screen.findByText('Order 7 not found')).toBeTruthy();
    });

    it('packs a partial shipment in a dialog and highlights the changed counters', async () => {
        jest
            .spyOn(ordersApi, 'get')
            .mockResolvedValueOnce(order())
            .mockResolvedValue(order({ status: 'IN_FULFILMENT', items: [orderItem({ packedQuantity: 2 })] }));
        jest.spyOn(ordersApi, 'shipments').mockResolvedValueOnce([]).mockResolvedValue([shipment()]);
        const create = jest.spyOn(ordersApi, 'createShipment').mockResolvedValue(shipment());
        await render(<OrderDetailsScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Pack shipment…' }));
        expect(screen.getByText('Pack a shipment for order #7')).toBeTruthy();
        let dialog = screen.getByTestId('dialog');
        expect(within(dialog).getByText('Desk lamp (LAMP-001)')).toBeTruthy();
        expect(within(dialog).getByText('3 of 3 not packed yet')).toBeTruthy();
        // Internal order item ids are not shown.
        expect(within(dialog).queryByText(/item 11/)).toBeNull();
        // The dropdown defaults to every remaining unit and offers 0 to 3.
        let select = within(dialog).getByRole('combobox', { name: 'Units to pack of Desk lamp (LAMP-001)' });
        expect(select).toHaveAccessibilityValue({ text: '3' });
        await fireEvent.press(select);
        expect(within(dialog).getAllByRole('menuitem').map((o) => o.props.accessibilityLabel)).toEqual(['0', '1', '2', '3']);
        await fireEvent.press(within(dialog).getByRole('menuitem', { name: '2' }));
        expect(select).toHaveAccessibilityValue({ text: '2' });
        await fireEvent.press(within(dialog).getByRole('button', { name: 'Pack shipment' }));

        expect(create).toHaveBeenCalledWith(7, { items: [{ orderItemId: 11, quantity: 2 }] }, expect.any(String));
        expect(await screen.findByText('Shipment #5 packed. Ship it next.')).toBeTruthy();
        expect(screen.queryByTestId('dialog')).toBeNull();
        expect(screen.getByLabelText('Packed 2')).toHaveStyle({ backgroundColor: '#fff4c2' });
        expect(within(screen.getByTestId('shipment-5')).getByText('Shipment: Packed')).toBeTruthy();
        const actions = screen.getByTestId('next-actions');
        expect(within(actions).getByRole('button', { name: 'Ship shipment 5' })).toBeTruthy();
        // One unit is still unpacked, so another partial shipment remains possible.
        await fireEvent.press(within(actions).getByRole('button', { name: 'Pack shipment…' }));
        dialog = screen.getByTestId('dialog');
        expect(within(dialog).getByText('1 of 3 not packed yet')).toBeTruthy();
        select = within(dialog).getByRole('combobox', { name: 'Units to pack of Desk lamp (LAMP-001)' });
        expect(select).toHaveAccessibilityValue({ text: '1' });
        await fireEvent.press(select);
        expect(within(dialog).getAllByRole('menuitem').map((o) => o.props.accessibilityLabel)).toEqual(['0', '1']);
    });

    it('packs only the products with units selected and skips fully packed ones', async () => {
        jest.spyOn(productsApi, 'list').mockResolvedValue([
            product(),
            product({ id: 2, sku: 'CHAIR-001', name: 'Office chair' }),
            product({ id: 3, sku: 'MUG-001', name: 'Mug' }),
        ]);
        jest.spyOn(ordersApi, 'get').mockResolvedValue(
            order({
                status: 'IN_FULFILMENT',
                items: [
                    orderItem({ packedQuantity: 1 }),
                    orderItem({ id: 12, productId: 2, quantity: 2 }),
                    orderItem({ id: 13, productId: 3, quantity: 2, packedQuantity: 2 }),
                ],
            })
        );
        jest.spyOn(ordersApi, 'shipments').mockResolvedValue([]);
        const create = jest.spyOn(ordersApi, 'createShipment').mockResolvedValue(shipment());
        await render(<OrderDetailsScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Pack shipment…' }));
        const dialog = screen.getByTestId('dialog');
        expect(within(dialog).getByText('All 2 packed')).toBeTruthy();
        expect(within(dialog).queryByRole('combobox', { name: 'Units to pack of Mug (MUG-001)' })).toBeNull();
        const lamp = within(dialog).getByRole('combobox', { name: 'Units to pack of Desk lamp (LAMP-001)' });
        const chair = within(dialog).getByRole('combobox', { name: 'Units to pack of Office chair (CHAIR-001)' });
        expect(lamp).toHaveAccessibilityValue({ text: '2' });
        expect(chair).toHaveAccessibilityValue({ text: '2' });
        const packButton = within(dialog).getByRole('button', { name: 'Pack shipment' });

        // Nothing selected: the button is disabled.
        await fireEvent.press(lamp);
        await fireEvent.press(within(dialog).getByRole('menuitem', { name: '0' }));
        await fireEvent.press(chair);
        await fireEvent.press(within(dialog).getByRole('menuitem', { name: '0' }));
        expect(packButton).toBeDisabled();
        expect(within(dialog).getByText('Choose at least one unit to pack.')).toBeTruthy();

        // 0 leaves the lamp out of this shipment.
        await fireEvent.press(chair);
        await fireEvent.press(within(dialog).getByRole('menuitem', { name: '1' }));
        expect(packButton).toBeEnabled();
        await fireEvent.press(packButton);

        expect(create).toHaveBeenCalledWith(7, { items: [{ orderItemId: 12, quantity: 1 }] }, expect.any(String));
    });

    it('keeps the dialog open with backend rule violations such as over-packing', async () => {
        jest.spyOn(ordersApi, 'get').mockResolvedValue(order());
        jest.spyOn(ordersApi, 'shipments').mockResolvedValue([]);
        // E.g. another administrator packed units after this order was loaded.
        jest
            .spyOn(ordersApi, 'createShipment')
            .mockRejectedValue(new ApiError(409, 'QUANTITY_EXCEEDED', 'Cannot pack 3 units of order item 11: only 1 remain unpacked'));
        await render(<OrderDetailsScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Pack shipment…' }));
        await fireEvent.press(screen.getByRole('button', { name: 'Pack shipment' }));

        const dialog = screen.getByTestId('dialog');
        expect(await within(dialog).findByText('Cannot pack 3 units of order item 11: only 1 remain unpacked')).toBeTruthy();
        expect(within(dialog).getByRole('combobox', { name: 'Units to pack of Desk lamp (LAMP-001)' })).toHaveAccessibilityValue({
            text: '3',
        });
    });

    it('ships and delivers shipments from the next actions', async () => {
        jest.spyOn(ordersApi, 'get').mockResolvedValue(order({ status: 'IN_FULFILMENT', items: [orderItem({ packedQuantity: 3 })] }));
        jest
            .spyOn(ordersApi, 'shipments')
            .mockResolvedValueOnce([shipment()])
            .mockResolvedValueOnce([shipment({ status: 'SHIPPED' })])
            .mockResolvedValue([shipment({ status: 'DELIVERED' })]);
        const ship = jest.spyOn(shipmentsApi, 'ship').mockResolvedValue(shipment({ status: 'SHIPPED' }));
        const deliver = jest.spyOn(shipmentsApi, 'deliver').mockResolvedValue(shipment({ status: 'DELIVERED' }));
        await render(<OrderDetailsScreen />);

        expect(await screen.findByText(/Ship shipment #5: its units leave the warehouse/)).toBeTruthy();
        await fireEvent.press(screen.getByRole('button', { name: 'Ship shipment 5' }));
        expect(ship).toHaveBeenCalledWith(5);
        expect(await screen.findByText('Shipment: Shipped')).toBeTruthy();

        await fireEvent.press(await screen.findByRole('button', { name: 'Deliver shipment 5' }));
        expect(deliver).toHaveBeenCalledWith(5);
        expect(await screen.findByText('Shipment #5 delivered. Its units can now be returned.')).toBeTruthy();
        expect(within(screen.getByTestId('shipment-5')).getByText('Shipment: Delivered')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Ship shipment|Deliver shipment/ })).toBeNull();
    });

    it('records a return in a dialog and shows the credit note and dispositions from the backend', async () => {
        const delivered = deliveredOrder();
        const result: OrderReturn = {
            id: 2,
            orderId: 7,
            returnedAt: '2026-01-03T10:00:00Z',
            items: [
                { orderItemId: 11, productId: 1, quantity: 1, reason: 'DEFECTIVE', condition: 'OPENED', disposition: 'DISCARD', refundAmount: 19.95 },
            ],
            creditNote: { number: 'CN-000002', amount: 19.95, issuedAt: '2026-01-03T10:00:00Z' },
            orderTotals: { grossTotal: 59.85, creditedTotal: 19.95, netTotal: 39.9 },
        };
        jest
            .spyOn(ordersApi, 'get')
            .mockResolvedValueOnce(delivered)
            .mockResolvedValue({ ...delivered, creditedTotal: 19.95, netTotal: 39.9, items: [{ ...delivered.items[0], returnedQuantity: 1 }] });
        jest.spyOn(ordersApi, 'shipments').mockResolvedValue([shipment({ status: 'DELIVERED' })]);
        jest.spyOn(ordersApi, 'returns').mockResolvedValueOnce([]).mockResolvedValue([result]);
        const create = jest.spyOn(ordersApi, 'createReturn').mockResolvedValue(result);
        await render(<OrderDetailsScreen />);

        expect(await screen.findByText('Order: Delivered')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Pack shipment…' })).toBeNull();
        await fireEvent.press(screen.getByRole('button', { name: 'Record return…' }));
        let dialog = screen.getByTestId('dialog');
        expect(within(dialog).getByText('Desk lamp (LAMP-001)')).toBeTruthy();
        expect(within(dialog).getByText('3 of 3 delivered units can be returned')).toBeTruthy();
        expect(within(dialog).queryByText(/item 11/)).toBeNull();
        // Nothing is returned until a quantity is chosen; reason and condition appear only then.
        let select = within(dialog).getByRole('combobox', { name: 'Quantity to return of Desk lamp (LAMP-001)' });
        expect(select).toHaveAccessibilityValue({ text: '0' });
        expect(within(dialog).getByRole('button', { name: 'Record return' })).toBeDisabled();
        expect(within(dialog).queryAllByRole('radio')).toHaveLength(0);

        await fireEvent.press(select);
        expect(within(dialog).getAllByRole('menuitem').map((o) => o.props.accessibilityLabel)).toEqual(['0', '1', '2', '3']);
        await fireEvent.press(within(dialog).getByRole('menuitem', { name: '1' }));
        expect(within(dialog).getByText('Reason')).toBeTruthy();
        expect(within(dialog).getByText('Condition')).toBeTruthy();
        expect(within(dialog).getByRole('radio', { name: 'Reason for Desk lamp (LAMP-001): No longer needed' })).toBeChecked();
        expect(within(dialog).getByRole('radio', { name: 'Condition of Desk lamp (LAMP-001): Unopened' })).toBeChecked();
        await fireEvent.press(within(dialog).getByRole('radio', { name: 'Reason for Desk lamp (LAMP-001): Defective' }));
        await fireEvent.press(within(dialog).getByRole('radio', { name: 'Condition of Desk lamp (LAMP-001): Opened' }));
        await fireEvent.press(within(dialog).getByRole('button', { name: 'Record return' }));

        expect(create).toHaveBeenCalledWith(
            7,
            { items: [{ orderItemId: 11, quantity: 1, reason: 'DEFECTIVE', condition: 'OPENED' }] },
            expect.any(String)
        );
        expect(
            await screen.findByText('Return #2 recorded: 1 × Desk lamp (LAMP-001) discarded. Credit note CN-000002 issued for 19.95.')
        ).toBeTruthy();
        expect(screen.queryByTestId('dialog')).toBeNull();
        const row = screen.getByTestId('return-2');
        expect(within(row).getByText('CN-000002')).toBeTruthy();
        expect(within(row).getByText('Discard')).toBeTruthy();
        expect(screen.getByLabelText('Net 39.90')).toHaveStyle({ backgroundColor: '#fff4c2' });

        // Reopening offers only the units not yet returned, starting from 0 again.
        await fireEvent.press(screen.getByRole('button', { name: 'Record return…' }));
        dialog = screen.getByTestId('dialog');
        expect(within(dialog).getByText('2 of 3 delivered units can be returned')).toBeTruthy();
        select = within(dialog).getByRole('combobox', { name: 'Quantity to return of Desk lamp (LAMP-001)' });
        expect(select).toHaveAccessibilityValue({ text: '0' });
        await fireEvent.press(select);
        expect(within(dialog).getAllByRole('menuitem').map((o) => o.props.accessibilityLabel)).toEqual(['0', '1', '2']);
    });

    it('returns only the products with a quantity chosen and skips fully returned ones', async () => {
        jest.spyOn(productsApi, 'list').mockResolvedValue([
            product(),
            product({ id: 2, sku: 'CHAIR-001', name: 'Office chair' }),
            product({ id: 3, sku: 'MUG-001', name: 'Mug' }),
        ]);
        const deliveredLine = { packedQuantity: 2, shippedQuantity: 2, deliveredQuantity: 2 };
        jest.spyOn(ordersApi, 'get').mockResolvedValue(
            order({
                status: 'DELIVERED',
                items: [
                    orderItem({ ...deliveredLine, quantity: 2, returnedQuantity: 1 }),
                    orderItem({ ...deliveredLine, id: 12, productId: 2, quantity: 2 }),
                    orderItem({ ...deliveredLine, id: 13, productId: 3, quantity: 2, returnedQuantity: 2 }),
                ],
            })
        );
        jest.spyOn(ordersApi, 'shipments').mockResolvedValue([shipment({ status: 'DELIVERED' })]);
        const result: OrderReturn = {
            id: 3,
            orderId: 7,
            returnedAt: '2026-01-03T10:00:00Z',
            items: [
                { orderItemId: 12, productId: 2, quantity: 2, reason: 'NO_LONGER_NEEDED', condition: 'UNOPENED', disposition: 'RESTOCK', refundAmount: 39.9 },
            ],
            creditNote: { number: 'CN-000003', amount: 39.9, issuedAt: '2026-01-03T10:00:00Z' },
            orderTotals: { grossTotal: 59.85, creditedTotal: 39.9, netTotal: 19.95 },
        };
        const create = jest.spyOn(ordersApi, 'createReturn').mockResolvedValue(result);
        await render(<OrderDetailsScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Record return…' }));
        const dialog = screen.getByTestId('dialog');
        expect(within(dialog).getByText('All 2 delivered units returned')).toBeTruthy();
        expect(within(dialog).queryByRole('combobox', { name: 'Quantity to return of Mug (MUG-001)' })).toBeNull();
        const lamp = within(dialog).getByRole('combobox', { name: 'Quantity to return of Desk lamp (LAMP-001)' });
        const chair = within(dialog).getByRole('combobox', { name: 'Quantity to return of Office chair (CHAIR-001)' });

        await fireEvent.press(lamp);
        expect(within(dialog).getAllByRole('menuitem').map((o) => o.props.accessibilityLabel)).toEqual(['0', '1']);
        await fireEvent.press(within(dialog).getByRole('menuitem', { name: '1' }));
        expect(within(dialog).getAllByRole('radio', { name: /^Reason for Desk lamp/ })).toHaveLength(4);
        // Back to 0 hides its reason and condition and leaves the lamp out of the return.
        await fireEvent.press(lamp);
        await fireEvent.press(within(dialog).getByRole('menuitem', { name: '0' }));
        expect(within(dialog).queryAllByRole('radio')).toHaveLength(0);
        expect(within(dialog).getByRole('button', { name: 'Record return' })).toBeDisabled();

        await fireEvent.press(chair);
        await fireEvent.press(within(dialog).getByRole('menuitem', { name: '2' }));
        expect(within(dialog).queryAllByRole('radio', { name: /Desk lamp/ })).toHaveLength(0);
        expect(within(dialog).getAllByRole('radio', { name: /^Condition of Office chair \(CHAIR-001\)/ })).toHaveLength(3);
        await fireEvent.press(within(dialog).getByRole('button', { name: 'Record return' }));

        expect(create).toHaveBeenCalledWith(
            7,
            { items: [{ orderItemId: 12, quantity: 2, reason: 'NO_LONGER_NEEDED', condition: 'UNOPENED' }] },
            expect.any(String)
        );
        expect(await screen.findByText(/Return #3 recorded: 2 × Office chair \(CHAIR-001\) restocked\. Credit note CN-000003/)).toBeTruthy();
    });

    it('keeps the return dialog open with backend rule violations', async () => {
        jest.spyOn(ordersApi, 'get').mockResolvedValue(deliveredOrder());
        jest.spyOn(ordersApi, 'shipments').mockResolvedValue([shipment({ status: 'DELIVERED' })]);
        jest
            .spyOn(ordersApi, 'createReturn')
            .mockRejectedValue(new ApiError(409, 'QUANTITY_EXCEEDED', 'Cannot return 2 units of order item 11: only 1 remain'));
        await render(<OrderDetailsScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Record return…' }));
        const dialog = screen.getByTestId('dialog');
        const select = within(dialog).getByRole('combobox', { name: 'Quantity to return of Desk lamp (LAMP-001)' });
        await fireEvent.press(select);
        await fireEvent.press(within(dialog).getByRole('menuitem', { name: '2' }));
        await fireEvent.press(within(dialog).getByRole('button', { name: 'Record return' }));

        expect(await within(dialog).findByText('Cannot return 2 units of order item 11: only 1 remain')).toBeTruthy();
        expect(select).toHaveAccessibilityValue({ text: '2' });
    });

    it('says when no actions remain', async () => {
        const delivered = deliveredOrder();
        jest.spyOn(ordersApi, 'get').mockResolvedValue({ ...delivered, items: [{ ...delivered.items[0], returnedQuantity: 3 }] });
        jest.spyOn(ordersApi, 'shipments').mockResolvedValue([shipment({ status: 'DELIVERED' })]);

        await render(<OrderDetailsScreen />);

        expect(await screen.findByText('No fulfilment or return actions remain for this order.')).toBeTruthy();
        expect(within(screen.getByTestId('next-actions')).queryAllByRole('button')).toHaveLength(0);
    });

    it('shows customers the order read-only, without fulfilment or return actions', async () => {
        jest.spyOn(ordersApi, 'get').mockResolvedValue(order({ status: 'IN_FULFILMENT' }));
        jest.spyOn(ordersApi, 'shipments').mockResolvedValue([shipment()]);
        await render(<CustomerOrderDetailsScreen />);

        expect(await screen.findByText('Order #7')).toBeTruthy();
        expect(screen.getByTestId('shipment-5')).toBeTruthy();
        expect(screen.getByText('Shipments, deliveries and returns appear here as the store processes your order.')).toBeTruthy();
        expect(screen.queryByTestId('next-actions')).toBeNull();
        expect(screen.queryByRole('button', { name: /Ship shipment|Deliver shipment|Pack shipment|Record return/ })).toBeNull();
    });
});
