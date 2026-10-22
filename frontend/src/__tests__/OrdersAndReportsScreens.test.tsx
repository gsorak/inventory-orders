import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { ordersApi, reportsApi } from '../api/client';
import CustomerOrdersScreen from '../app/(customer)/orders/index';
import OrdersScreen from '../app/admin/orders/index';
import ReportsScreen from '../app/admin/reports';
import { order } from '../test-utils/fixtures';

jest.mock('expo-router', () => require('../test-utils/expoRouterMock'));

beforeEach(() => {
    jest.restoreAllMocks();
});

describe('Orders screen', () => {
    it('lists orders with their reservation and totals', async () => {
        jest.spyOn(ordersApi, 'list').mockResolvedValue({
            items: [order({ creditedTotal: 19.95, netTotal: 39.9 })],
            page: 0,
            size: 20,
            totalElements: 1,
            totalPages: 1,
        });

        await render(<OrdersScreen />);

        const row = await screen.findByTestId('order-7');
        expect(within(row).getByText('#3')).toBeTruthy();
        expect(within(row).getByText('39.90')).toBeTruthy();
        expect(screen.getByText('1 orders')).toBeTruthy();
    });

    it('explains how orders are created when there are none', async () => {
        jest.spyOn(ordersApi, 'list').mockResolvedValue({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });

        await render(<OrdersScreen />);

        expect(await screen.findByText('No orders yet. They appear when customers pay at checkout.')).toBeTruthy();
    });

    it('shows the same orders to customers with customer wording', async () => {
        jest.spyOn(ordersApi, 'list').mockResolvedValue({ items: [order()], page: 0, size: 20, totalElements: 1, totalPages: 1 });

        await render(<CustomerOrdersScreen />);

        expect(await screen.findByTestId('order-7')).toBeTruthy();
        expect(screen.getByText('Orders')).toBeTruthy();
        expect(screen.queryByText('Orders & Fulfilment')).toBeNull();
    });
});

describe('Reports screen', () => {
    beforeEach(() => {
        jest.spyOn(reportsApi, 'lowStock').mockResolvedValue({
            items: [{ productId: 5, sku: 'CABLE-1', name: 'Cable', onHand: 12, reserved: 0, available: 12, lowStockThreshold: 15 }],
        });
        jest.spyOn(reportsApi, 'inventoryAging').mockResolvedValue({
            asOf: '2026-01-01T00:00:00Z',
            method: 'FIFO estimate.',
            products: [],
        });
    });

    it('shows the reports and switches the cycle-time period', async () => {
        const cycleTime = jest.spyOn(reportsApi, 'orderCycleTime').mockResolvedValue({
            from: '2025-12-01T00:00:00Z',
            to: '2026-01-01T00:00:00Z',
            deliveredOrders: 2,
            averageHours: 44,
            medianHours: 44,
            p90Hours: 72,
            minHours: 16,
            maxHours: 72,
        });

        await render(<ReportsScreen />);

        const lowStock = await screen.findByTestId('low-stock-CABLE-1');
        expect(within(lowStock).getByText('Low stock')).toBeTruthy();
        expect(screen.getByText('Delivered orders: 2')).toBeTruthy();
        expect(screen.getByLabelText('Average: 44 h')).toBeTruthy();
        expect(screen.getByLabelText('90th percentile: 72 h')).toBeTruthy();

        const [from, to] = cycleTime.mock.calls[0];
        expect(Date.parse(to) - Date.parse(from)).toBe(30 * 24 * 60 * 60 * 1000);

        await fireEvent.press(screen.getByRole('button', { name: 'Last 7 days' }));
        const [from7, to7] = cycleTime.mock.calls[cycleTime.mock.calls.length - 1];
        expect(Date.parse(to7) - Date.parse(from7)).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('shows a dash when there are no delivered orders', async () => {
        jest.spyOn(reportsApi, 'orderCycleTime').mockResolvedValue({
            from: '2025-12-01T00:00:00Z',
            to: '2026-01-01T00:00:00Z',
            deliveredOrders: 0,
            averageHours: null,
            medianHours: null,
            p90Hours: null,
            minHours: null,
            maxHours: null,
        });

        await render(<ReportsScreen />);

        expect(await screen.findByLabelText('Average: —')).toBeTruthy();
        expect(screen.getByText('No orders were delivered in this period.')).toBeTruthy();
        expect(screen.getByText('No products yet.')).toBeTruthy();
    });
});
