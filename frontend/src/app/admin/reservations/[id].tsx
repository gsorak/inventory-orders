import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError, errorMessage, productsApi, reservationsApi } from '../../../api/client';
import type { Product, Reservation } from '../../../api/types';
import { Banner, type BannerMessage } from '../../../components/Banner';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { LoadState } from '../../../components/LoadState';
import { StatusBadge } from '../../../components/StatusBadge';
import { TableCell, TableHeader, TableRow, type Column } from '../../../components/Table';
import { colors, common } from '../../../theme';
import { formatDateTime, formatMoney, formatTimeUntil } from '../../../utils/format';
import { productLabel } from '../../../utils/products';
import { reservedUnits, stockHold } from '../../../utils/reservations';

export default function ReservationDetailsScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const reservationId = Number(id);
    const [reservation, setReservation] = useState<Reservation>();
    const [products, setProducts] = useState<Product[]>([]);
    const [orderId, setOrderId] = useState<number>();
    const [orderError, setOrderError] = useState<string>();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>();
    const [message, setMessage] = useState<BannerMessage>();
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    const load = useCallback(async () => {
        if (!Number.isInteger(reservationId) || reservationId <= 0) {
            setLoadError(`Reservation "${id}" was not found.`);
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError(undefined);
        setOrderError(undefined);
        try {
            const [r, productList] = await Promise.all([reservationsApi.get(reservationId), productsApi.list()]);
            setReservation(r);
            setProducts(productList);
            setNow(Date.now());
            if (r.status === 'CONFIRMED') {
                reservationsApi.order(r.id).then(
                    (order) => setOrderId(order.id),
                    (e) => setOrderError(errorMessage(e, 'Failed to load the order.'))
                );
            }
        } catch (e) {
            setLoadError(
                e instanceof ApiError && e.status === 404
                    ? `Reservation #${reservationId} was not found.`
                    : errorMessage(e, 'Failed to load the reservation.')
            );
        } finally {
            setLoading(false);
        }
    }, [id, reservationId]);

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
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [activeUntil]);

    const cancel = async () => {
        setCancelling(true);
        setMessage(undefined);
        try {
            const cancelled = await reservationsApi.cancel(reservationId);
            setReservation(cancelled);
            setMessage({ kind: 'success', text: `Reservation #${cancelled.id} cancelled; its stock is available again.` });
        } catch (e) {
            setMessage({ kind: 'error', text: errorMessage(e, 'Failed to cancel the reservation.') });
            await load();
        } finally {
            setConfirmCancel(false);
            setCancelling(false);
        }
    };

    const hold = reservation ? stockHold(reservation) : undefined;

    return (
        <ScrollView contentContainerStyle={common.screen}>
            <Link href="/admin/reservations" style={styles.link}>
                ← Reservations
            </Link>
            {message && <Banner {...message} onDismiss={() => setMessage(undefined)} />}

            <LoadState loading={loading && !reservation} error={loadError} onRetry={load} empty={reservation ? undefined : ''}>
                {reservation && hold && (
                    <>
                        <View style={common.card} testID="reservation-summary">
                            <View style={[common.row, { justifyContent: 'space-between' }]}>
                                <View style={common.row}>
                                    <Text style={common.heading}>{`Reservation #${reservation.id}`}</Text>
                                    <StatusBadge status={reservation.status} subject="Reservation" />
                                </View>
                                <Button label="Refresh" variant="secondary" onPress={load} busy={loading} busyLabel="Refreshing…" />
                            </View>

                            <View style={styles.facts}>
                                <Fact label="Created" value={formatDateTime(reservation.createdAt)} />
                                <Fact
                                    label="Expires"
                                    value={
                                        reservation.status === 'ACTIVE'
                                            ? `${formatDateTime(reservation.expiresAt)} (${formatTimeUntil(reservation.expiresAt, now)})`
                                            : formatDateTime(reservation.expiresAt)
                                    }
                                />
                                <Fact label="Payment confirmed" value={formatDateTime(reservation.confirmedAt)} />
                                <Fact label="Stock released" value={formatDateTime(reservation.stockReleasedAt)} />
                            </View>

                            <View style={[styles.hold, reservation.status === 'ACTIVE' && styles.holdActive]} testID="stock-hold">
                                <Text style={common.subheading}>{`Stock: ${hold.label}`}</Text>
                                <Text style={common.text}>{hold.detail}</Text>
                            </View>

                            {reservation.status === 'CONFIRMED' && (
                                <View style={common.row}>
                                    {orderId !== undefined && (
                                        <Link
                                            href={{ pathname: '/admin/orders/[id]', params: { id: String(orderId) } }}
                                            style={styles.link}
                                        >
                                            {`Open order #${orderId} →`}
                                        </Link>
                                    )}
                                    {orderError && <Text style={styles.error}>{`${orderError} Use Refresh to try again.`}</Text>}
                                </View>
                            )}

                            {reservation.status === 'ACTIVE' && (
                                <View style={common.row}>
                                    <Button label="Cancel reservation" variant="danger" onPress={() => setConfirmCancel(true)} />
                                    <Text style={common.muted}>Releases the held stock now; the customer can no longer pay.</Text>
                                </View>
                            )}
                        </View>

                        <View style={common.card}>
                            <Text style={common.heading}>Reserved products</Text>
                            <TableHeader columns={Object.values(ITEM_COLUMNS)} />
                            {reservation.items.map((item) => (
                                <TableRow key={item.productId} testID={`reservation-item-${item.productId}`}>
                                    <TableCell column={ITEM_COLUMNS.product}>
                                        <Text style={common.text}>{productLabel(products, item.productId)}</Text>
                                    </TableCell>
                                    <TableCell column={ITEM_COLUMNS.quantity}>
                                        <Text style={common.text} accessibilityLabel={`Quantity ${item.quantity}`}>
                                            {item.quantity}
                                        </Text>
                                    </TableCell>
                                    <TableCell column={ITEM_COLUMNS.unitPrice}>
                                        <Text style={common.text}>{formatMoney(item.unitPrice)}</Text>
                                    </TableCell>
                                    <TableCell column={ITEM_COLUMNS.lineTotal}>
                                        <Text style={common.text}>{formatMoney(item.lineTotal)}</Text>
                                    </TableCell>
                                </TableRow>
                            ))}
                            <Text style={[common.subheading, styles.number]}>
                                {`${reservedUnits(reservation)} units · Total ${formatMoney(reservation.total)}`}
                            </Text>
                        </View>
                    </>
                )}
            </LoadState>

            <ConfirmDialog
                visible={confirmCancel}
                title={`Cancel reservation #${reservationId}?`}
                message="The reserved stock is released immediately. A cancelled reservation cannot be confirmed or reopened."
                confirmLabel="Cancel reservation"
                busy={cancelling}
                onConfirm={cancel}
                onCancel={() => setConfirmCancel(false)}
            />
        </ScrollView>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.fact}>
            <Text style={common.tableHeader}>{label}</Text>
            <Text style={common.text}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    link: { color: colors.primary, fontWeight: '600' },
    error: { color: colors.danger, fontSize: 14 },
    number: { textAlign: 'right' },
    facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    fact: { gap: 2, minWidth: 160 },
    hold: { gap: 4, padding: 10, borderRadius: 6, backgroundColor: colors.background },
    holdActive: { backgroundColor: '#eef3fb' },
});

const ITEM_COLUMNS = {
    product: { label: 'Product', wide: true },
    quantity: { label: 'Quantity', numeric: true },
    unitPrice: { label: 'Unit price', numeric: true },
    lineTotal: { label: 'Line total', numeric: true },
} satisfies Record<string, Column>;
