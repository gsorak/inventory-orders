import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { errorMessage, ordersApi } from '../api/client';
import type { Order, Page } from '../api/types';
import { Button } from '../components/Button';
import { LoadState } from '../components/LoadState';
import { Pager } from '../components/Pager';
import { StatusBadge } from '../components/StatusBadge';
import { TableCell, TableHeader, TableRow, type Column } from '../components/Table';
import type { Mode } from '../navigation';
import { colors, common } from '../theme';
import { formatDateTime, formatMoney } from '../utils/format';

const PAGE_SIZE = 20;

const COLUMNS = {
    order: { label: 'Order' },
    status: { label: 'Status' },
    reservation: { label: 'Reservation' },
    payment: { label: 'Payment' },
    confirmed: { label: 'Confirmed' },
    delivered: { label: 'Delivered' },
    gross: { label: 'Gross', numeric: true },
    credited: { label: 'Credited', numeric: true },
    net: { label: 'Net', numeric: true },
} satisfies Record<string, Column>;

const copy = {
    admin: {
        heading: 'Orders & Fulfilment',
        intro: 'Orders are created when a customer pays at checkout. Open an order to pack, ship, deliver and return its units.',
        empty: 'No orders yet. They appear when customers pay at checkout.',
    },
    customer: {
        heading: 'Orders',
        intro: 'Open an order to follow its shipments, deliveries, returns and credit notes.',
        empty: 'No orders yet. An order is created when you confirm payment at checkout.',
    },
};

export default function OrdersScreen({ mode }: { mode: Mode }) {
    const [page, setPage] = useState<Page<Order>>();
    const [pageNumber, setPageNumber] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>();

    const load = useCallback(async (pageToLoad: number) => {
        setLoading(true);
        setLoadError(undefined);
        try {
            setPage(await ordersApi.list(pageToLoad, PAGE_SIZE));
        } catch (e) {
            setLoadError(errorMessage(e, 'Failed to load orders.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            load(pageNumber);
        }, [load, pageNumber])
    );

    const orders = page?.items ?? [];

    return (
        <ScrollView contentContainerStyle={common.screen}>
            <View style={common.card}>
                <View style={[common.row, { justifyContent: 'space-between' }]}>
                    <Text style={common.heading}>{copy[mode].heading}</Text>
                    <Button
                        label="Refresh"
                        variant="secondary"
                        onPress={() => load(pageNumber)}
                        busy={loading}
                        busyLabel="Refreshing…"
                    />
                </View>
                <Text style={common.muted}>{copy[mode].intro}</Text>
                <LoadState
                    loading={loading}
                    error={loadError}
                    onRetry={() => load(pageNumber)}
                    empty={orders.length === 0 ? copy[mode].empty : undefined}
                >
                    <TableHeader columns={Object.values(COLUMNS)} />
                    {orders.map((o) => (
                        <TableRow key={o.id} testID={`order-${o.id}`}>
                            <TableCell column={COLUMNS.order}>
                                <Link
                                    href={{
                                        pathname: mode === 'admin' ? '/admin/orders/[id]' : '/orders/[id]',
                                        params: { id: String(o.id) },
                                    }}
                                    style={{ color: colors.primary, fontWeight: '600' }}
                                    accessibilityLabel={`Open order ${o.id}`}
                                >
                                    {`#${o.id} →`}
                                </Link>
                            </TableCell>
                            <TableCell column={COLUMNS.status}>
                                <StatusBadge status={o.status} />
                            </TableCell>
                            <TableCell column={COLUMNS.reservation}>
                                <Text style={common.text}>{`#${o.reservationId}`}</Text>
                            </TableCell>
                            <TableCell column={COLUMNS.payment}>
                                <Text style={common.text}>{o.paymentReference}</Text>
                            </TableCell>
                            <TableCell column={COLUMNS.confirmed}>
                                <Text style={common.text}>{formatDateTime(o.confirmedAt)}</Text>
                            </TableCell>
                            <TableCell column={COLUMNS.delivered}>
                                <Text style={common.text}>{formatDateTime(o.deliveredAt)}</Text>
                            </TableCell>
                            <TableCell column={COLUMNS.gross}>
                                <Text style={common.text}>{formatMoney(o.grossTotal)}</Text>
                            </TableCell>
                            <TableCell column={COLUMNS.credited}>
                                <Text style={common.text}>{formatMoney(o.creditedTotal)}</Text>
                            </TableCell>
                            <TableCell column={COLUMNS.net}>
                                <Text style={common.text}>{formatMoney(o.netTotal)}</Text>
                            </TableCell>
                        </TableRow>
                    ))}
                    {page && <Pager page={page} noun="orders" onChange={setPageNumber} />}
                </LoadState>
            </View>
        </ScrollView>
    );
}
