import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage, productsApi, reservationsApi } from '../../../api/client';
import type { Page, Product, Reservation } from '../../../api/types';
import { Button } from '../../../components/Button';
import { LoadState } from '../../../components/LoadState';
import { Pager } from '../../../components/Pager';
import { StatusBadge } from '../../../components/StatusBadge';
import { TableCell, TableHeader, TableRow, type Column } from '../../../components/Table';
import { colors, common } from '../../../theme';
import { formatDateTime, formatMoney, formatTimeUntil } from '../../../utils/format';
import { productLabel } from '../../../utils/products';
import { reservedUnits, stockHold } from '../../../utils/reservations';

const PAGE_SIZE = 10;

export default function ReservationsScreen() {
    const [products, setProducts] = useState<Product[]>([]);
    const [page, setPage] = useState<Page<Reservation>>();
    const [pageNumber, setPageNumber] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>();

    const load = useCallback(async (pageToLoad: number) => {
        setLoading(true);
        setLoadError(undefined);
        try {
            const [productList, reservations] = await Promise.all([
                productsApi.list(),
                reservationsApi.list(pageToLoad, PAGE_SIZE),
            ]);
            setProducts(productList);
            setPage(reservations);
            setNow(Date.now());
        } catch (e) {
            setLoadError(errorMessage(e, 'Failed to load reservations.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            load(pageNumber);
        }, [load, pageNumber])
    );

    const reservations = page?.items ?? [];

    return (
        <ScrollView contentContainerStyle={common.screen}>
            <View style={common.card}>
                <View style={[common.row, { justifyContent: 'space-between' }]}>
                    <Text style={common.heading}>Reservations</Text>
                    <Button label="Refresh" variant="secondary" onPress={() => load(pageNumber)} busy={loading} busyLabel="Refreshing…" />
                </View>
                <Text style={common.muted}>
                    Customers create reservations at checkout. A reservation holds stock for 15 minutes: confirming the
                    payment turns it into an order, cancelling or expiry releases the stock.
                </Text>
                <LoadState
                    loading={loading && !page}
                    error={loadError}
                    onRetry={() => load(pageNumber)}
                    empty={reservations.length === 0 ? 'No reservations yet. They appear when customers check out.' : undefined}
                >
                    <TableHeader columns={Object.values(COLUMNS)} />
                    {reservations.map((r) => {
                        const hold = stockHold(r);
                        return (
                            <TableRow key={r.id} style={{ alignItems: 'flex-start' }} testID={`reservation-${r.id}`}>
                                <TableCell column={COLUMNS.reservation}>
                                    <Link
                                        href={{ pathname: '/admin/reservations/[id]', params: { id: String(r.id) } }}
                                        style={styles.link}
                                        accessibilityLabel={`Open reservation ${r.id}`}
                                    >
                                        {`#${r.id} →`}
                                    </Link>
                                    <StatusBadge status={r.status} />
                                </TableCell>
                                <TableCell column={COLUMNS.products}>
                                    {r.items.map((item) => (
                                        <Text key={item.productId} style={common.text}>
                                            {`${item.quantity} × ${productLabel(products, item.productId)}`}
                                        </Text>
                                    ))}
                                </TableCell>
                                <TableCell column={COLUMNS.total}>
                                    <Text style={common.text}>{formatMoney(r.total)}</Text>
                                </TableCell>
                                <TableCell column={COLUMNS.timing}>
                                    <Text style={common.muted}>{`Created ${formatDateTime(r.createdAt)}`}</Text>
                                    <Text style={r.status === 'ACTIVE' ? common.text : common.muted}>
                                        {r.status === 'ACTIVE'
                                            ? `Expires ${formatTimeUntil(r.expiresAt, now)} (${formatDateTime(r.expiresAt)})`
                                            : `Expiry ${formatDateTime(r.expiresAt)}`}
                                    </Text>
                                </TableCell>
                                <TableCell column={COLUMNS.stock}>
                                    <Text style={common.text} accessibilityLabel={`Stock ${hold.label}`}>
                                        {hold.label}
                                    </Text>
                                    <Text style={common.muted}>{`${reservedUnits(r)} units`}</Text>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                    {page && <Pager page={page} noun="reservations" onChange={setPageNumber} />}
                </LoadState>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    link: { color: colors.primary, fontWeight: '600' },
});

const COLUMNS = {
    reservation: { label: 'Reservation' },
    products: { label: 'Products', wide: true },
    total: { label: 'Total', numeric: true },
    timing: { label: 'Created / expiry', wide: true },
    stock: { label: 'Stock' },
} satisfies Record<string, Column>;
