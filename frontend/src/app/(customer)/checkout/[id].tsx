import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError, errorMessage, productsApi, reservationsApi } from '../../../api/client';
import type { Product, Reservation } from '../../../api/types';
import { Banner, type BannerMessage } from '../../../components/Banner';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { LoadState } from '../../../components/LoadState';
import { StatusBadge } from '../../../components/StatusBadge';
import { useCart } from '../../../cart/CartContext';
import { isOutcomeUnknown, loadCheckout, simulatedPaymentReference } from '../../../cart/checkout';
import { colors, common } from '../../../theme';
import { formatDateTime, formatMoney, formatTimeUntil } from '../../../utils/format';
import { productLabel } from '../../../utils/products';
import { withRetry } from '../../../utils/retry';

type Action = 'confirm' | 'cancel' | 'open';

function actionError(e: unknown, action: Action): string {
    if (action === 'open') {
        return errorMessage(e, 'Failed to load the order. Please try again.');
    }
    if (e instanceof ApiError && e.code === 'RESERVATION_EXPIRED') {
        return 'The reservation expired before this could be completed. Nothing was charged and the stock was released.';
    }
    if (isOutcomeUnknown(e)) {
        return action === 'confirm'
            ? `${errorMessage(e, 'Payment confirmation failed.')} The payment status is checked with the backend before you can try again; trying again reuses the same payment reference and cannot create a second order.`
            : `${errorMessage(e, 'Cancelling failed.')} The checkout status is checked with the backend before you can try again.`;
    }
    return errorMessage(e, action === 'confirm' ? 'Payment confirmation failed.' : 'Cancelling failed.');
}

export default function CheckoutScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const reservationId = Number(id);
    const router = useRouter();
    const { completeCheckout, endCheckout } = useCart();
    const [reservation, setReservation] = useState<Reservation>();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>();
    const [message, setMessage] = useState<BannerMessage>();
    const [now, setNow] = useState(() => Date.now());
    const [action, setAction] = useState<Action>();
    const [confirmCancel, setConfirmCancel] = useState(false);
    // Guards against a second press before the re-render disables the buttons.
    const actionRef = useRef(false);

    // A cancelled or expired checkout unlocks the cart, which keeps its contents, and returns there.
    const returnToCart = useCallback(
        (r: Reservation) => {
            endCheckout(r.id);
            router.replace({
                pathname: '/cart',
                params: { closed: r.status === 'EXPIRED' ? 'expired' : 'cancelled', reservation: String(r.id) },
            });
        },
        [endCheckout, router]
    );

    const load = useCallback(async () => {
        if (!Number.isInteger(reservationId) || reservationId <= 0) {
            setLoadError(`Checkout "${id}" was not found.`);
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError(undefined);
        try {
            // The backend decides whether the checkout is still open; the timer and earlier responses do not.
            const r = await withRetry(() => reservationsApi.get(reservationId));
            const current = loadCheckout()?.reservationId === r.id;
            if (current && (r.status === 'EXPIRED' || r.status === 'CANCELLED')) {
                returnToCart(r);
                return;
            }
            setReservation(r);
            setNow(Date.now());
            productsApi.list().then(setProducts, () => undefined);
            if (current && r.status === 'CONFIRMED') {
                // The payment went through but its response was lost: finish the checkout and open the order.
                completeCheckout(r.id);
                try {
                    const order = await withRetry(() => reservationsApi.order(r.id));
                    router.replace({ pathname: '/orders/[id]', params: { id: String(order.id) } });
                } catch (e) {
                    setMessage({ kind: 'error', text: actionError(e, 'open') });
                }
            }
        } catch (e) {
            setLoadError(
                e instanceof ApiError && e.status === 404
                    ? `Reservation #${reservationId} was not found.`
                    : `${errorMessage(e, 'Failed to load the checkout.')} The checkout status could not be verified, so payment and cancellation are unavailable until it loads.`
            );
        } finally {
            setLoading(false);
        }
    }, [id, reservationId, returnToCart, completeCheckout, router]);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const activeUntil = reservation?.status === 'ACTIVE' ? reservation.expiresAt : undefined;
    useEffect(() => {
        if (activeUntil === undefined) {
            return;
        }
        const timer = setInterval(() => {
            const current = Date.now();
            setNow(current);
            // Once the countdown runs out, let the backend tell whether the reservation really expired.
            if (Date.parse(activeUntil) <= current) {
                clearInterval(timer);
                load();
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [activeUntil, load]);

    const run = async (kind: Action, operation: () => Promise<void>) => {
        if (actionRef.current) {
            return;
        }
        actionRef.current = true;
        setAction(kind);
        setMessage(undefined);
        try {
            await operation();
        } catch (e) {
            setMessage({ kind: 'error', text: actionError(e, kind) });
            // The request may have taken effect, or the reservation changed meanwhile: ask the backend.
            if (
                isOutcomeUnknown(e) ||
                (e instanceof ApiError && (e.code === 'RESERVATION_EXPIRED' || e.code === 'INVALID_STATE_TRANSITION'))
            ) {
                load();
            }
        } finally {
            actionRef.current = false;
            setAction(undefined);
        }
    };

    // Replaying the confirmation with the same reference returns the existing order, so a retry after a lost
    // response cannot create a second order.
    const confirmPayment = () =>
        run('confirm', async () => {
            const order = await withRetry(() =>
                reservationsApi.confirm(reservationId, simulatedPaymentReference(reservationId))
            );
            completeCheckout(reservationId);
            router.replace({ pathname: '/orders/[id]', params: { id: String(order.id), confirmed: '1' } });
        });

    // For a reservation confirmed earlier, e.g. reopened from a link: look its order up read-only.
    const openOrder = () =>
        run('open', async () => {
            const order = await withRetry(() => reservationsApi.order(reservationId));
            router.replace({ pathname: '/orders/[id]', params: { id: String(order.id) } });
        });

    const cancelCheckout = () =>
        run('cancel', async () => {
            setConfirmCancel(false);
            returnToCart(await withRetry(() => reservationsApi.cancel(reservationId)));
        });

    return (
        <ScrollView contentContainerStyle={common.screen}>
            {message && <Banner {...message} onDismiss={() => setMessage(undefined)} />}
            <View style={common.card}>
                <LoadState loading={loading && !reservation} error={loadError} onRetry={load} empty={reservation ? undefined : ''}>
                    {reservation && (
                        <>
                            <View style={[common.row, { justifyContent: 'space-between' }]}>
                                <Text style={common.heading}>{`Checkout · reservation #${reservation.id}`}</Text>
                                <StatusBadge status={reservation.status} />
                            </View>

                            {reservation.items.map((item) => (
                                <View key={item.productId} style={common.tableRow} testID={`checkout-item-${item.productId}`}>
                                    <Text style={common.wideCell}>{productLabel(products, item.productId)}</Text>
                                    <Text style={common.cell}>{`${item.quantity} × ${formatMoney(item.unitPrice)}`}</Text>
                                    <Text style={[common.cell, styles.amount]}>{formatMoney(item.lineTotal)}</Text>
                                </View>
                            ))}
                            <Text style={[common.subheading, styles.amount]}>{`Total ${formatMoney(reservation.total)}`}</Text>

                            {reservation.status === 'ACTIVE' && (
                                <>
                                    <Text style={common.text} testID="checkout-expiry">
                                        {`Stock is reserved until ${formatDateTime(reservation.expiresAt)} (expires ${formatTimeUntil(reservation.expiresAt, now)}).`}
                                    </Text>
                                    <Banner
                                        kind="info"
                                        text="Payment is simulated: no payment details are needed and no money is charged. Confirming creates the order."
                                    />
                                    <View style={common.row}>
                                        <Button
                                            label="Confirm payment"
                                            busyLabel="Confirming…"
                                            onPress={confirmPayment}
                                            busy={action === 'confirm'}
                                            disabled={action !== undefined || loading}
                                        />
                                        <Button
                                            label="Cancel checkout"
                                            variant="danger"
                                            onPress={() => setConfirmCancel(true)}
                                            disabled={action !== undefined || loading}
                                        />
                                    </View>
                                    <Text style={common.muted}>
                                        Your cart is locked until you confirm the payment or cancel the checkout. Leaving this
                                        page keeps the reservation until it expires; Cart brings you back here.
                                    </Text>
                                </>
                            )}

                            {reservation.status === 'CONFIRMED' && (
                                <>
                                    <Text style={common.text}>Payment for this reservation has already been confirmed.</Text>
                                    <View style={common.row}>
                                        <Button
                                            label="View order"
                                            busyLabel="Opening…"
                                            onPress={openOrder}
                                            busy={action === 'open'}
                                        />
                                        <Link href="/orders" style={styles.link}>
                                            Your orders →
                                        </Link>
                                    </View>
                                </>
                            )}

                            {(reservation.status === 'EXPIRED' || reservation.status === 'CANCELLED') && (
                                <>
                                    <Text style={common.text} testID="checkout-closed">
                                        {reservation.status === 'EXPIRED'
                                            ? `This reservation expired at ${formatDateTime(reservation.expiresAt)} before payment was confirmed. Nothing was charged and the stock was released.`
                                            : 'This checkout was cancelled. Nothing was charged and the stock was released.'}
                                    </Text>
                                    <Text style={common.muted}>Your cart is unchanged, so you can check out again.</Text>
                                    <View style={common.row}>
                                        <Link href="/cart" style={styles.link}>
                                            Back to cart →
                                        </Link>
                                        <Link href="/shop" style={styles.link}>
                                            Continue shopping →
                                        </Link>
                                    </View>
                                </>
                            )}
                        </>
                    )}
                </LoadState>
            </View>

            <ConfirmDialog
                visible={confirmCancel}
                title="Cancel checkout?"
                message="The reserved stock is released and nothing is charged. Your cart stays as it is."
                confirmLabel="Yes, cancel"
                busy={action === 'cancel'}
                onConfirm={cancelCheckout}
                onCancel={() => setConfirmCancel(false)}
            />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    link: { color: colors.primary, fontWeight: '600' },
    amount: { fontWeight: '600', textAlign: 'right' },
});
