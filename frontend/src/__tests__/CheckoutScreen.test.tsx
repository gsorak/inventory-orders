import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { ApiError, productsApi, reservationsApi } from '../api/client';
import CheckoutScreen from '../app/(customer)/checkout/[id]';
import { CartProvider } from '../cart/CartContext';
import { loadCheckout } from '../cart/checkout';
import { mockRouter, setMockParams } from '../test-utils/expoRouterMock';
import { order, product, reservation } from '../test-utils/fixtures';
import { clearMemoryStore, loadJson, saveJson } from '../utils/storage';

jest.mock('expo-router', () => require('../test-utils/expoRouterMock'));

const inFifteenMinutes = () => new Date(Date.now() + 15 * 60_000).toISOString();
const lampLine = { productId: 1, sku: 'LAMP-001', name: 'Desk lamp', unitPrice: 19.95, quantity: 2 };

beforeEach(() => {
    jest.restoreAllMocks();
    clearMemoryStore();
    mockRouter.replace.mockClear();
    setMockParams({ id: '3' });
    jest.spyOn(productsApi, 'list').mockResolvedValue([product()]);
    saveJson('inventory-orders.cart', [lampLine]);
    saveJson('inventory-orders.checkout', {
        request: JSON.stringify({ items: [{ productId: 1, quantity: 2 }] }),
        idempotencyKey: 'key-1',
        reservationId: 3,
    });
});

const renderCheckout = () =>
    render(
        <CartProvider>
            <CheckoutScreen />
        </CartProvider>
    );

const confirmPayment = async () => fireEvent.press(await screen.findByRole('button', { name: 'Confirm payment' }));

describe('Checkout screen', () => {
    it('shows the reserved products, backend total, expiry and that payment is simulated', async () => {
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(reservation({ expiresAt: inFifteenMinutes() }));
        await renderCheckout();

        const item = await screen.findByTestId('checkout-item-1');
        expect(within(item).getByText('Desk lamp (LAMP-001)')).toBeTruthy();
        expect(within(item).getByText('2 × 19.95')).toBeTruthy();
        expect(screen.getByText('Total 39.90')).toBeTruthy();
        expect(screen.getByTestId('checkout-expiry')).toHaveTextContent(/expires in 1[45] min/);
        expect(screen.getByText(/Payment is simulated/)).toBeTruthy();
    });

    it('confirms the payment, clears the cart and opens the order', async () => {
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(reservation({ expiresAt: inFifteenMinutes() }));
        const confirm = jest.spyOn(reservationsApi, 'confirm').mockResolvedValue(order());
        await renderCheckout();

        await confirmPayment();

        expect(confirm).toHaveBeenCalledWith(3, 'SIM-3');
        expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: '7', confirmed: '1' } });
        expect(loadJson('inventory-orders.cart')).toEqual([]);
        expect(loadCheckout()).toBeUndefined();
    });

    it('clears the cart after payment even if its stored contents changed during the checkout', async () => {
        saveJson('inventory-orders.cart', [{ ...lampLine, quantity: 5 }]);
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(reservation({ expiresAt: inFifteenMinutes() }));
        const confirm = jest.spyOn(reservationsApi, 'confirm').mockResolvedValue(order());
        await renderCheckout();
        await screen.findByRole('button', { name: 'Confirm payment' });
        saveJson('inventory-orders.cart', [{ ...lampLine, productId: 9, sku: 'OTHER-9' }]);

        await confirmPayment();

        expect(confirm).toHaveBeenCalledTimes(1);
        expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: '7', confirmed: '1' } });
        expect(loadJson('inventory-orders.cart')).toEqual([]);
        expect(loadCheckout()).toBeUndefined();
    });

    it("leaves the cart alone when paying for a reservation that is not this cart's checkout", async () => {
        clearMemoryStore();
        saveJson('inventory-orders.cart', [lampLine]);
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(reservation({ expiresAt: inFifteenMinutes() }));
        jest.spyOn(reservationsApi, 'confirm').mockResolvedValue(order());
        await renderCheckout();

        await confirmPayment();

        expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: '7', confirmed: '1' } });
        expect(loadJson('inventory-orders.cart')).toEqual([lampLine]);
    });

    it('repeats a failed confirmation with the same payment reference after checking the status', async () => {
        const get = jest.spyOn(reservationsApi, 'get').mockResolvedValue(reservation({ expiresAt: inFifteenMinutes() }));
        const confirm = jest
            .spyOn(reservationsApi, 'confirm')
            .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the backend.'))
            .mockResolvedValue(order());
        await renderCheckout();

        await confirmPayment();
        expect(screen.getByText(/cannot create a second order/)).toBeTruthy();
        await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
        expect(mockRouter.replace).not.toHaveBeenCalled();

        await confirmPayment();
        expect(confirm.mock.calls).toEqual([
            [3, 'SIM-3'],
            [3, 'SIM-3'],
        ]);
        expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    });

    it('recovers the order when a confirmation succeeded but its response was lost', async () => {
        jest.spyOn(reservationsApi, 'get')
            .mockResolvedValueOnce(reservation({ expiresAt: inFifteenMinutes() }))
            .mockResolvedValue(reservation({ status: 'CONFIRMED' }));
        const confirm = jest
            .spyOn(reservationsApi, 'confirm')
            .mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the backend.'));
        const lookup = jest.spyOn(reservationsApi, 'order').mockResolvedValue(order());
        await renderCheckout();

        await confirmPayment();

        await waitFor(() =>
            expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: '7' } })
        );
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledWith(3);
        expect(loadJson('inventory-orders.cart')).toEqual([]);
        expect(loadCheckout()).toBeUndefined();
    });

    it('blocks payment and cancellation while the status cannot be verified', async () => {
        jest.spyOn(reservationsApi, 'get')
            .mockResolvedValueOnce(reservation({ expiresAt: inFifteenMinutes() }))
            .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the backend.'))
            .mockResolvedValue(reservation({ status: 'CONFIRMED' }));
        jest.spyOn(reservationsApi, 'confirm').mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Offline.'));
        jest.spyOn(reservationsApi, 'order').mockResolvedValue(order());
        await renderCheckout();

        await confirmPayment();

        expect(await screen.findByText(/The checkout status could not be verified/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Confirm payment' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Cancel checkout' })).toBeNull();
        expect(loadCheckout()?.reservationId).toBe(3);

        await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() =>
            expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: '7' } })
        );
    });

    it('opens the order automatically when the current checkout was already confirmed, e.g. after a refresh', async () => {
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(reservation({ status: 'CONFIRMED' }));
        const confirm = jest.spyOn(reservationsApi, 'confirm');
        const lookup = jest.spyOn(reservationsApi, 'order').mockResolvedValue(order());
        await renderCheckout();

        await waitFor(() =>
            expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: '7' } })
        );
        expect(lookup).toHaveBeenCalledWith(3);
        expect(confirm).not.toHaveBeenCalled();
        expect(loadCheckout()).toBeUndefined();
        expect(loadJson('inventory-orders.cart')).toEqual([]);
    });

    it('offers the order of an earlier confirmed reservation without changing the cart', async () => {
        clearMemoryStore();
        saveJson('inventory-orders.cart', [lampLine]);
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(reservation({ status: 'CONFIRMED' }));
        const lookup = jest.spyOn(reservationsApi, 'order').mockResolvedValue(order());
        await renderCheckout();

        expect(await screen.findByText('Payment for this reservation has already been confirmed.')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Confirm payment' })).toBeNull();
        expect(mockRouter.replace).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByRole('button', { name: 'View order' }));

        expect(lookup).toHaveBeenCalledWith(3);
        expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: '7' } });
        expect(loadJson('inventory-orders.cart')).toEqual([lampLine]);
    });

    it('offers only payment and cancellation while the checkout is active', async () => {
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(reservation({ expiresAt: inFifteenMinutes() }));
        await renderCheckout();

        expect(await screen.findByRole('button', { name: 'Confirm payment' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Cancel checkout' })).toBeTruthy();
        expect(screen.queryByText(/Back to cart/)).toBeNull();
        expect(screen.getByText(/Your cart is locked until you confirm the payment or cancel the checkout/)).toBeTruthy();
    });

    it('cancels the checkout after confirmation and returns to the unchanged cart', async () => {
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(reservation({ expiresAt: inFifteenMinutes() }));
        const cancel = jest
            .spyOn(reservationsApi, 'cancel')
            .mockResolvedValue(reservation({ status: 'CANCELLED', stockReleasedAt: '2026-01-01T10:01:00Z' }));
        await renderCheckout();

        await fireEvent.press(await screen.findByRole('button', { name: 'Cancel checkout' }));
        await fireEvent.press(screen.getByRole('button', { name: 'Yes, cancel' }));

        expect(cancel).toHaveBeenCalledWith(3);
        expect(mockRouter.replace).toHaveBeenCalledWith({
            pathname: '/cart',
            params: { closed: 'cancelled', reservation: '3' },
        });
        expect(loadJson('inventory-orders.cart')).toEqual([lampLine]);
        expect(loadCheckout()).toBeUndefined();
    });

    it('checks the status after an unanswered cancellation instead of assuming it worked', async () => {
        const get = jest
            .spyOn(reservationsApi, 'get')
            .mockResolvedValueOnce(reservation({ expiresAt: inFifteenMinutes() }))
            .mockResolvedValue(reservation({ expiresAt: inFifteenMinutes() }));
        jest.spyOn(reservationsApi, 'cancel').mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Offline.'));
        await renderCheckout();

        await fireEvent.press(await screen.findByRole('button', { name: 'Cancel checkout' }));
        await fireEvent.press(screen.getByRole('button', { name: 'Yes, cancel' }));

        expect(screen.getByText(/The checkout status is checked with the backend/)).toBeTruthy();
        await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
        // Still active according to the backend: the checkout stays locked and open.
        expect(mockRouter.replace).not.toHaveBeenCalled();
        expect(loadCheckout()?.reservationId).toBe(3);
        expect(await screen.findByRole('button', { name: 'Cancel checkout' })).toBeEnabled();
    });

    it('returns to the cart when the current reservation has expired', async () => {
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(reservation({ status: 'EXPIRED' }));
        await renderCheckout();

        await waitFor(() =>
            expect(mockRouter.replace).toHaveBeenCalledWith({
                pathname: '/cart',
                params: { closed: 'expired', reservation: '3' },
            })
        );
        expect(loadCheckout()).toBeUndefined();
        expect(loadJson('inventory-orders.cart')).toEqual([lampLine]);
    });

    it('explains an older closed reservation opened from a link', async () => {
        clearMemoryStore();
        jest.spyOn(reservationsApi, 'get').mockResolvedValue(reservation({ status: 'EXPIRED' }));
        await renderCheckout();

        expect(await screen.findByTestId('checkout-closed')).toHaveTextContent(/This reservation expired at .* Nothing was charged/);
        expect(screen.queryByRole('button', { name: 'Confirm payment' })).toBeNull();
        expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('handles a reservation that expires while the page is open', async () => {
        const get = jest
            .spyOn(reservationsApi, 'get')
            .mockResolvedValueOnce(reservation({ expiresAt: inFifteenMinutes() }))
            .mockResolvedValue(reservation({ status: 'EXPIRED' }));
        jest.spyOn(reservationsApi, 'confirm').mockRejectedValue(
            new ApiError(409, 'RESERVATION_EXPIRED', 'Cannot confirm reservation 3: it expired')
        );
        await renderCheckout();

        await confirmPayment();

        await waitFor(() =>
            expect(mockRouter.replace).toHaveBeenCalledWith({
                pathname: '/cart',
                params: { closed: 'expired', reservation: '3' },
            })
        );
        expect(get).toHaveBeenCalledTimes(2);
        expect(loadCheckout()).toBeUndefined();
    });

    it('reports a reservation that does not exist', async () => {
        jest.spyOn(reservationsApi, 'get').mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Reservation 3 not found'));
        await renderCheckout();

        expect(await screen.findByText('Reservation #3 was not found.')).toBeTruthy();
    });
});
