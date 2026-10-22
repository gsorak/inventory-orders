import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError, errorMessage, productsApi, reservationsApi } from '../../api/client';
import type { CreateReservationRequest, Product } from '../../api/types';
import { Banner, type BannerMessage } from '../../components/Banner';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Field } from '../../components/Field';
import { cartTotal, lineTotal, reservationRequest } from '../../cart/cart';
import { useCart } from '../../cart/CartContext';
import { isOutcomeUnknown, loadCheckout } from '../../cart/checkout';
import { colors, common } from '../../theme';
import { formatMoney } from '../../utils/format';
import { withRetry } from '../../utils/retry';
import { LIMITS, wholeNumberError } from '../../utils/validation';

function checkoutError(e: unknown): string {
    if (e instanceof ApiError && e.code === 'INSUFFICIENT_STOCK') {
        return `${e.userMessage}. Nothing was reserved: reduce the highlighted quantities and check out again.`;
    }
    return `${errorMessage(e, 'Checkout failed.')} Nothing was reserved and your cart is unchanged; please try again.`;
}

function closedNotice(closed: string | undefined, reservationId: string | undefined): BannerMessage | undefined {
    if (closed === 'expired') {
        return {
            kind: 'error',
            text: `Reservation #${reservationId} expired before payment was confirmed, so its stock was released and nothing was charged. Your cart is unchanged and can be edited; checking out again makes a new reservation.`,
        };
    }
    if (closed === 'cancelled') {
        return {
            kind: 'success',
            text: `Checkout cancelled: reservation #${reservationId} was released and nothing was charged. Your cart is unchanged and can be edited.`,
        };
    }
    return undefined;
}

export default function CartScreen() {
    const router = useRouter();
    const { closed, reservation: closedReservation } = useLocalSearchParams<{ closed?: string; reservation?: string }>();
    const { cart, checkout, setQuantity, remove, clear, refresh, beginCheckout, restartCheckout, reservationCreated, endCheckout } =
        useCart();
    const [products, setProducts] = useState<Product[]>();
    const [message, setMessage] = useState<BannerMessage>();
    const [drafts, setDrafts] = useState<Record<number, string>>({});
    const [draftErrors, setDraftErrors] = useState<Record<number, string>>({});
    const [confirmClear, setConfirmClear] = useState(false);
    const [busy, setBusy] = useState(false);
    // Guards against a second press before the re-render disables the button.
    const busyRef = useRef(false);
    // While a reservation request is running the busy state disables editing; afterwards the lock is shown.
    const locked = checkout !== undefined && !busy;

    const loadProducts = useCallback(async () => {
        const list = await withRetry(() => productsApi.list());
        setProducts(list);
        refresh(list);
        return list;
    }, [refresh]);

    // Shows why a checkout ended when the checkout screen returns here (adjusting state while rendering).
    const noticeKey = `${closed ?? ''}#${closedReservation ?? ''}`;
    const [shownNotice, setShownNotice] = useState('#');
    if (noticeKey !== shownNotice) {
        setShownNotice(noticeKey);
        setMessage(closedNotice(closed, closedReservation));
    }

    // During checkout the cart belongs to the reservation: the Cart page opens the checkout instead.
    useFocusEffect(
        useCallback(() => {
            const reservationId = loadCheckout()?.reservationId;
            if (reservationId !== undefined) {
                router.replace({ pathname: '/checkout/[id]', params: { id: String(reservationId) } });
                return;
            }
            loadProducts().catch(() => undefined);
        }, [loadProducts, router])
    );

    const changeQuantity = (productId: number, text: string) => {
        const error = wholeNumberError(text, 1, LIMITS.reservationQuantity);
        if (error) {
            setDrafts({ ...drafts, [productId]: text });
            setDraftErrors({ ...draftErrors, [productId]: error });
            return;
        }
        const { [productId]: _draft, ...otherDrafts } = drafts;
        const { [productId]: _error, ...otherErrors } = draftErrors;
        setDrafts(otherDrafts);
        setDraftErrors(otherErrors);
        setQuantity(productId, Number(text.trim()));
    };

    const removeLine = (productId: number) => {
        changeQuantity(productId, '1'); // drops any invalid draft for the line
        remove(productId);
    };

    /**
     * Reserves `request` atomically. The cart is locked from the moment the request is sent: if no answer arrives,
     * the reservation may exist, so it stays locked until a retry with the same Idempotency-Key settles it.
     */
    const reserve = async (request: CreateReservationRequest, refreshProducts: boolean) => {
        if (busyRef.current) {
            return;
        }
        busyRef.current = true;
        setBusy(true);
        setMessage(undefined);
        let sent = false;
        try {
            if (refreshProducts) {
                await loadProducts();
            }
            const key = beginCheckout(request);
            sent = true;
            let reservation = await withRetry(() => reservationsApi.create(request, key));
            if (reservation.status === 'EXPIRED' || reservation.status === 'CANCELLED') {
                // The key belonged to an earlier, finished checkout of the same cart.
                const renewed = restartCheckout(request);
                reservation = await withRetry(() => reservationsApi.create(request, renewed));
            }
            reservationCreated(reservation.id);
            router.replace({ pathname: '/checkout/[id]', params: { id: String(reservation.id) } });
        } catch (e) {
            if (sent && isOutcomeUnknown(e)) {
                setMessage({
                    kind: 'error',
                    text: `${errorMessage(e, 'The checkout request failed.')} Your cart may already be reserved, so it stays locked until you retry the checkout; retrying cannot reserve it twice.`,
                });
            } else {
                if (sent) {
                    endCheckout();
                }
                setMessage({ kind: 'error', text: checkoutError(e) });
                if (e instanceof ApiError && e.code === 'INSUFFICIENT_STOCK') {
                    loadProducts().catch(() => undefined);
                }
            }
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const checkOut = () => {
        if (cart.length > 0) {
            reserve(reservationRequest(cart), true);
        }
    };

    const retryCheckout = () => {
        if (checkout) {
            reserve(JSON.parse(checkout.request) as CreateReservationRequest, false);
        }
    };

    const availableOf = (productId: number) => products?.find((p) => p.id === productId)?.stock.available;
    const hasDraftErrors = Object.keys(draftErrors).length > 0;

    return (
        <ScrollView contentContainerStyle={common.screen}>
            {message && <Banner {...message} onDismiss={() => setMessage(undefined)} />}
            {checkout?.reservationId !== undefined && (
                <View style={[common.card, styles.pending]} testID="checkout-locked">
                    <Text style={common.text}>
                        {`Your cart is locked while checkout #${checkout.reservationId} is in progress: confirm the payment or cancel the checkout to change it.`}
                    </Text>
                    <Link
                        href={{ pathname: '/checkout/[id]', params: { id: String(checkout.reservationId) } }}
                        style={styles.link}
                    >
                        Continue checkout →
                    </Link>
                </View>
            )}
            {locked && checkout.reservationId === undefined && (
                <View style={[common.card, styles.pending]} testID="checkout-unconfirmed">
                    <Text style={common.text}>
                        Your last checkout got no answer from the backend, so your cart may already be reserved. It stays
                        locked until the checkout is retried; the retry reuses the same request key and cannot reserve twice.
                    </Text>
                    <View style={common.row}>
                        <Button label="Retry checkout" busyLabel="Checking…" onPress={retryCheckout} />
                    </View>
                </View>
            )}

            <View style={common.card}>
                <View style={[common.row, { justifyContent: 'space-between' }]}>
                    <Text style={common.heading}>Cart</Text>
                    {cart.length > 0 && !locked && (
                        <Button label="Clear cart" variant="secondary" onPress={() => setConfirmClear(true)} disabled={busy} />
                    )}
                </View>

                {cart.length === 0 ? (
                    <View style={common.row}>
                        <Text style={common.muted}>Your cart is empty.</Text>
                        <Link href="/shop" style={styles.link}>
                            Browse the shop →
                        </Link>
                    </View>
                ) : (
                    <>
                        {!locked && (
                            <Text style={common.muted}>
                                Adding products to the cart does not reserve them. Availability and prices are confirmed when you
                                check out.
                            </Text>
                        )}
                        {cart.map((line) => {
                            const available = availableOf(line.productId);
                            const short = !locked && available !== undefined && line.quantity > available;
                            return (
                                <View key={line.productId} style={[common.tableRow, short && styles.short]} testID={`cart-line-${line.sku}`}>
                                    <View style={[common.wideCell, { gap: 2 }]}>
                                        <Text style={common.subheading}>{line.name}</Text>
                                        <Text style={common.muted}>{`SKU ${line.sku} · ${formatMoney(line.unitPrice)} each`}</Text>
                                        {short && (
                                            <Text style={styles.shortText}>
                                                {available === 0 ? 'Out of stock' : `Only ${available} available`}
                                            </Text>
                                        )}
                                    </View>
                                    {locked ? (
                                        <Text style={common.cell} accessibilityLabel={`Quantity of ${line.sku} ${line.quantity}`}>
                                            {`Quantity ${line.quantity}`}
                                        </Text>
                                    ) : (
                                        <View style={[common.row, { alignItems: 'flex-end' }]}>
                                            <Button
                                                label="−"
                                                accessibilityLabel={`Decrease ${line.sku}`}
                                                variant="secondary"
                                                onPress={() => changeQuantity(line.productId, String(line.quantity - 1))}
                                                disabled={busy || line.quantity <= 1}
                                            />
                                            <Field
                                                label={`Quantity of ${line.sku}`}
                                                value={drafts[line.productId] ?? String(line.quantity)}
                                                onChangeText={(v) => changeQuantity(line.productId, v)}
                                                error={draftErrors[line.productId]}
                                                format="integer"
                                                width={110}
                                            />
                                            <Button
                                                label="+"
                                                accessibilityLabel={`Increase ${line.sku}`}
                                                variant="secondary"
                                                onPress={() => changeQuantity(line.productId, String(line.quantity + 1))}
                                                disabled={busy}
                                            />
                                        </View>
                                    )}
                                    <Text style={[common.cell, styles.amount]} accessibilityLabel={`Line total ${formatMoney(lineTotal(line))}`}>
                                        {formatMoney(lineTotal(line))}
                                    </Text>
                                    {!locked && (
                                        <Button
                                            label="Remove"
                                            accessibilityLabel={`Remove ${line.sku}`}
                                            variant="secondary"
                                            onPress={() => removeLine(line.productId)}
                                            disabled={busy}
                                        />
                                    )}
                                </View>
                            );
                        })}
                        <View style={[common.row, { justifyContent: 'space-between' }]}>
                            <Text style={common.subheading} accessibilityLabel={`Estimated total ${formatMoney(cartTotal(cart))}`}>
                                {`Estimated total ${formatMoney(cartTotal(cart))}`}
                            </Text>
                            {!locked && (
                                <Button
                                    label="Check out"
                                    busyLabel="Reserving…"
                                    onPress={checkOut}
                                    busy={busy}
                                    disabled={hasDraftErrors}
                                />
                            )}
                        </View>
                    </>
                )}
            </View>

            <ConfirmDialog
                visible={confirmClear}
                title="Clear the cart?"
                message="All products are removed from your cart. Nothing is reserved, so no stock is affected."
                confirmLabel="Clear cart"
                onConfirm={() => {
                    clear();
                    setDrafts({});
                    setDraftErrors({});
                    setConfirmClear(false);
                }}
                onCancel={() => setConfirmClear(false)}
            />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    link: { color: colors.primary, fontWeight: '600' },
    pending: { backgroundColor: '#eef3fb' },
    short: { backgroundColor: '#fdecea' },
    shortText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
    amount: { fontWeight: '600', textAlign: 'right' },
});
