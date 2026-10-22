import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { ApiError, productsApi, reservationsApi } from '../api/client';
import type { Page, Reservation } from '../api/types';
import ReservationDetailsScreen from '../app/admin/reservations/[id]';
import ReservationsScreen from '../app/admin/reservations/index';
import { setMockParams } from '../test-utils/expoRouterMock';
import { order, product, reservation } from '../test-utils/fixtures';

jest.mock('expo-router', () => require('../test-utils/expoRouterMock'));

function page<T>(items: T[], overrides: Partial<Page<T>> = {}): Page<T> {
    return { items, page: 0, size: 10, totalElements: items.length, totalPages: 1, ...overrides };
}

const inFifteenMinutes = () => new Date(Date.now() + 15 * 60 * 1000).toISOString();

beforeEach(() => {
    jest.restoreAllMocks();
    setMockParams({ id: '3' });
    jest.spyOn(productsApi, 'list').mockResolvedValue([product(), product({ id: 2, sku: 'BULB-1', name: 'Bulb' })]);
});

describe('Reservations monitoring list', () => {
    it('lists reservations with status, products, expiry and stock release', async () => {
        jest.spyOn(reservationsApi, 'list').mockResolvedValue(
            page<Reservation>([
                reservation({ id: 5, expiresAt: inFifteenMinutes() }),
                reservation({ id: 4, status: 'CANCELLED', stockReleasedAt: '2026-01-01T10:01:00Z' }),
                reservation({ id: 3, status: 'EXPIRED', stockReleasedAt: null }),
                reservation({ id: 2, status: 'CONFIRMED', confirmedAt: '2026-01-01T10:02:00Z' }),
            ])
        );

        await render(<ReservationsScreen />);

        const active = await screen.findByTestId('reservation-5');
        expect(within(active).getByText('#5 →')).toBeTruthy();
        expect(within(active).getByLabelText('Status ACTIVE')).toBeTruthy();
        expect(within(active).getByText('2 × Desk lamp (LAMP-001)')).toBeTruthy();
        expect(within(active).getByText(/^Expires in 1[45] min/)).toBeTruthy();
        expect(within(active).getByLabelText('Stock Held')).toBeTruthy();

        expect(within(screen.getByTestId('reservation-4')).getByLabelText('Stock Released')).toBeTruthy();
        expect(within(screen.getByTestId('reservation-3')).getByLabelText('Stock Release pending')).toBeTruthy();
        expect(within(screen.getByTestId('reservation-2')).getByLabelText('Stock Held by order')).toBeTruthy();
    });

    it('does not offer reserving or payment, which belong to the customer checkout', async () => {
        jest.spyOn(reservationsApi, 'list').mockResolvedValue(page([reservation({ expiresAt: inFifteenMinutes() })]));

        await render(<ReservationsScreen />);
        await screen.findByTestId('reservation-3');

        expect(screen.queryByRole('button', { name: /Reserve|Confirm payment|Cancel reservation/ })).toBeNull();
        expect(screen.queryByLabelText(/Quantity of|Payment reference/)).toBeNull();
    });

    it('shows an empty state', async () => {
        jest.spyOn(reservationsApi, 'list').mockResolvedValue(page<Reservation>([]));

        await render(<ReservationsScreen />);

        expect(await screen.findByText('No reservations yet. They appear when customers check out.')).toBeTruthy();
    });

    it('requests the page chosen in the pager', async () => {
        const list = jest
            .spyOn(reservationsApi, 'list')
            .mockResolvedValue(page([reservation()], { totalElements: 25, totalPages: 3 }));

        await render(<ReservationsScreen />);
        await fireEvent.press(await screen.findByRole('button', { name: 'Next' }));

        expect(list).toHaveBeenLastCalledWith(1, 10);
    });
});

describe('Reservation details', () => {
    it('shows reserved products, quantities, timeline and how the stock is held', async () => {
        const expiresAt = inFifteenMinutes();
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(
            reservation({
                expiresAt,
                total: 59.85,
                items: [
                    { productId: 1, quantity: 2, unitPrice: 19.95, lineTotal: 39.9 },
                    { productId: 2, quantity: 1, unitPrice: 19.95, lineTotal: 19.95 },
                ],
            })
        );

        await render(<ReservationDetailsScreen />);

        expect(await screen.findByText('Reservation #3')).toBeTruthy();
        expect(screen.getByText('Reservation: Active')).toBeTruthy();
        expect(within(screen.getByTestId('reservation-item-1')).getByText('Desk lamp (LAMP-001)')).toBeTruthy();
        expect(within(screen.getByTestId('reservation-item-1')).getByLabelText('Quantity 2')).toBeTruthy();
        expect(within(screen.getByTestId('reservation-item-2')).getByLabelText('Quantity 1')).toBeTruthy();
        expect(screen.getByText('3 units · Total 59.85')).toBeTruthy();
        expect(screen.getByText(/\(in 1[45] min\)$/)).toBeTruthy();
        const hold = screen.getByTestId('stock-hold');
        expect(within(hold).getByText('Stock: Held')).toBeTruthy();
        expect(within(hold).getByText(/Released automatically if the payment is not confirmed/)).toBeTruthy();
    });

    it.each([
        [
            'expired, awaiting the sweep',
            reservation({ status: 'EXPIRED' }),
            'Stock: Release pending',
            'Expired without payment; the stock is released by the next background sweep.',
        ],
        [
            'expired and released',
            reservation({ status: 'EXPIRED', stockReleasedAt: '2026-01-01T10:16:00Z' }),
            'Stock: Released',
            /^Expired without payment; the stock was released 2026-01-01/,
        ],
        [
            'cancelled',
            reservation({ status: 'CANCELLED', stockReleasedAt: '2026-01-01T10:01:00Z' }),
            'Stock: Released',
            /^Cancelled; the stock was released 2026-01-01/,
        ],
    ])('explains the stock release when %s, without a cancel action', async (_, r, label, detail) => {
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(r);

        await render(<ReservationDetailsScreen />);

        const hold = await screen.findByTestId('stock-hold');
        expect(within(hold).getByText(label)).toBeTruthy();
        expect(within(hold).getByText(detail)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Cancel reservation' })).toBeNull();
    });

    it('links a confirmed reservation to its order', async () => {
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(
            reservation({ status: 'CONFIRMED', confirmedAt: '2026-01-01T10:02:00Z' })
        );
        const lookup = jest.spyOn(reservationsApi, 'order').mockResolvedValue(order({ id: 7, reservationId: 3 }));

        await render(<ReservationDetailsScreen />);

        expect(await screen.findByText('Open order #7 →')).toBeTruthy();
        expect(screen.getByText('Stock: Held by order')).toBeTruthy();
        expect(lookup).toHaveBeenCalledWith(3);
    });

    it('explains a failed order lookup', async () => {
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(
            reservation({ status: 'CONFIRMED', confirmedAt: '2026-01-01T10:02:00Z' })
        );
        jest.spyOn(reservationsApi, 'order').mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the backend.'));

        await render(<ReservationDetailsScreen />);

        expect(await screen.findByText('Could not reach the backend. Use Refresh to try again.')).toBeTruthy();
        expect(screen.queryByText(/Open order/)).toBeNull();
    });

    it('cancels an active reservation only after confirmation', async () => {
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(reservation({ expiresAt: inFifteenMinutes() }));
        const cancel = jest
            .spyOn(reservationsApi, 'cancel')
            .mockResolvedValue(reservation({ status: 'CANCELLED', stockReleasedAt: '2026-01-01T10:01:00Z' }));
        await render(<ReservationDetailsScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Cancel reservation' }));
        expect(screen.getByText('Cancel reservation #3?')).toBeTruthy();
        await fireEvent.press(screen.getByRole('button', { name: 'Keep' }));
        expect(cancel).not.toHaveBeenCalled();

        await fireEvent.press(screen.getByRole('button', { name: 'Cancel reservation' }));
        const dialogButtons = screen.getAllByRole('button', { name: 'Cancel reservation' });
        await fireEvent.press(dialogButtons[dialogButtons.length - 1]);

        expect(cancel).toHaveBeenCalledWith(3);
        expect(await screen.findByText('Reservation #3 cancelled; its stock is available again.')).toBeTruthy();
        expect(screen.getByText('Reservation: Cancelled')).toBeTruthy();
        expect(screen.getByText('Stock: Released')).toBeTruthy();
    });

    it('shows why a cancellation failed and reloads the current state', async () => {
        const get = jest
            .spyOn(reservationsApi, 'get')
            .mockResolvedValueOnce(reservation({ expiresAt: inFifteenMinutes() }))
            .mockResolvedValue(reservation({ status: 'CONFIRMED', confirmedAt: '2026-01-01T10:02:00Z' }));
        jest.spyOn(reservationsApi, 'order').mockResolvedValue(order());
        jest
            .spyOn(reservationsApi, 'cancel')
            .mockRejectedValue(new ApiError(409, 'INVALID_STATE_TRANSITION', 'Reservation 3 is CONFIRMED'));
        await render(<ReservationDetailsScreen />);

        await fireEvent.press(await screen.findByRole('button', { name: 'Cancel reservation' }));
        const dialogButtons = screen.getAllByRole('button', { name: 'Cancel reservation' });
        await fireEvent.press(dialogButtons[dialogButtons.length - 1]);

        expect(await screen.findByText('Reservation 3 is CONFIRMED')).toBeTruthy();
        expect(await screen.findByText('Reservation: Confirmed')).toBeTruthy();
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('reports an unknown reservation', async () => {
        jest.spyOn(reservationsApi, 'get').mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Reservation 3 not found'));

        await render(<ReservationDetailsScreen />);

        expect(await screen.findByText('Reservation #3 was not found.')).toBeTruthy();
    });
});
