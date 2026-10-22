import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage, reportsApi } from '../../api/client';
import type { InventoryAgingReport, LowStockReport, OrderCycleTimeReport } from '../../api/types';
import { Button } from '../../components/Button';
import { LoadState } from '../../components/LoadState';
import { StatusBadge } from '../../components/StatusBadge';
import { TableCell, TableHeader, TableRow, type Column } from '../../components/Table';
import { colors, common } from '../../theme';
import { formatDateTime, formatNumber } from '../../utils/format';
import { levelOf } from '../../utils/products';

const PERIODS = [7, 30, 90] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Reports {
    lowStock: LowStockReport;
    aging: InventoryAgingReport;
    cycleTime: OrderCycleTimeReport;
}

export default function ReportsScreen() {
    const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
    const [reports, setReports] = useState<Reports>();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>();

    const load = useCallback(async (periodDays: number) => {
        setLoading(true);
        setLoadError(undefined);
        const to = new Date();
        const from = new Date(to.getTime() - periodDays * DAY_MS);
        try {
            const [lowStock, aging, cycleTime] = await Promise.all([
                reportsApi.lowStock(),
                reportsApi.inventoryAging(),
                reportsApi.orderCycleTime(from.toISOString(), to.toISOString()),
            ]);
            setReports({ lowStock, aging, cycleTime });
        } catch (e) {
            setLoadError(errorMessage(e, 'Failed to load the reports.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            load(days);
        }, [load, days])
    );

    return (
        <ScrollView contentContainerStyle={common.screen}>
            <View style={[common.row, { justifyContent: 'space-between' }]}>
                <Text style={common.heading}>Reports</Text>
                <Button label="Refresh" variant="secondary" onPress={() => load(days)} busy={loading} busyLabel="Refreshing…" />
            </View>
            <LoadState loading={loading} error={loadError} onRetry={() => load(days)} empty={reports ? undefined : ''}>
                {reports && (
                    <>
                        <View style={common.card} testID="low-stock-report">
                            <View style={[common.row, { justifyContent: 'space-between' }]}>
                                <Text style={common.heading}>Low stock</Text>
                                <Link href="/admin/inventory" style={styles.link}>
                                    Receive stock in Inventory →
                                </Link>
                            </View>
                            <Text style={common.muted}>Products whose available stock is at or below their low-stock threshold.</Text>
                            {reports.lowStock.items.length === 0 ? (
                                <Text style={common.muted}>No products are low on stock.</Text>
                            ) : (
                                <View>
                                    <TableHeader columns={Object.values(LOW_STOCK_COLUMNS)} />
                                    {reports.lowStock.items.map((i) => (
                                        <TableRow key={i.productId} testID={`low-stock-${i.sku}`}>
                                            <TableCell column={LOW_STOCK_COLUMNS.product}>
                                                <Text style={common.text}>{i.name}</Text>
                                                <Text style={common.muted}>{i.sku}</Text>
                                            </TableCell>
                                            <TableCell column={LOW_STOCK_COLUMNS.level}>
                                                <StatusBadge status={levelOf(i.available, i.lowStockThreshold)} />
                                            </TableCell>
                                            <TableCell column={LOW_STOCK_COLUMNS.onHand}>
                                                <Text style={common.text}>{i.onHand}</Text>
                                            </TableCell>
                                            <TableCell column={LOW_STOCK_COLUMNS.reserved}>
                                                <Text style={common.text}>{i.reserved}</Text>
                                            </TableCell>
                                            <TableCell column={LOW_STOCK_COLUMNS.available}>
                                                <Text style={[common.text, styles.strong]}>{i.available}</Text>
                                            </TableCell>
                                            <TableCell column={LOW_STOCK_COLUMNS.threshold}>
                                                <Text style={common.text}>{i.lowStockThreshold}</Text>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </View>
                            )}
                        </View>

                        <View style={common.card} testID="cycle-time-report">
                            <Text style={common.heading}>Order cycle time</Text>
                            <Text style={common.muted}>
                                Hours from payment confirmation to delivery of the last unit, for orders delivered in the period.
                            </Text>
                            <View style={common.row}>
                                {PERIODS.map((p) => (
                                    <Button
                                        key={p}
                                        label={`Last ${p} days`}
                                        variant={p === days ? 'primary' : 'secondary'}
                                        onPress={() => setDays(p)}
                                        disabled={loading}
                                    />
                                ))}
                            </View>
                            <View style={common.row}>
                                <Text style={common.subheading}>{`Delivered orders: ${reports.cycleTime.deliveredOrders}`}</Text>
                                <Text style={common.muted}>
                                    {`${formatDateTime(reports.cycleTime.from)} – ${formatDateTime(reports.cycleTime.to)}`}
                                </Text>
                            </View>
                            <View style={styles.tiles}>
                                <Stat label="Average" value={formatNumber(reports.cycleTime.averageHours, ' h')} />
                                <Stat label="Median" value={formatNumber(reports.cycleTime.medianHours, ' h')} />
                                <Stat label="90th percentile" value={formatNumber(reports.cycleTime.p90Hours, ' h')} />
                                <Stat label="Min" value={formatNumber(reports.cycleTime.minHours, ' h')} />
                                <Stat label="Max" value={formatNumber(reports.cycleTime.maxHours, ' h')} />
                            </View>
                            {reports.cycleTime.deliveredOrders === 0 && (
                                <Text style={common.muted}>No orders were delivered in this period.</Text>
                            )}
                        </View>

                        <View style={common.card} testID="aging-report">
                            <Text style={common.heading}>Inventory aging</Text>
                            <Text style={common.muted}>{`As of ${formatDateTime(reports.aging.asOf)}. ${reports.aging.method}`}</Text>
                            {reports.aging.products.length === 0 ? (
                                <Text style={common.muted}>No products yet.</Text>
                            ) : (
                                <View>
                                    <TableHeader columns={Object.values(AGING_COLUMNS)} />
                                    {reports.aging.products.map((p) => (
                                        <TableRow key={p.productId} testID={`aging-${p.sku}`}>
                                            <TableCell column={AGING_COLUMNS.product}>
                                                <Text style={common.text}>{p.name}</Text>
                                                <Text style={common.muted}>{p.sku}</Text>
                                            </TableCell>
                                            <TableCell column={AGING_COLUMNS.onHand}>
                                                <Text style={[common.text, styles.strong]}>{p.onHand}</Text>
                                            </TableCell>
                                            <TableCell column={AGING_COLUMNS.days0To30}>
                                                <Text style={common.text}>{p.unitsByAge.days0To30}</Text>
                                            </TableCell>
                                            <TableCell column={AGING_COLUMNS.days31To60}>
                                                <Text style={common.text}>{p.unitsByAge.days31To60}</Text>
                                            </TableCell>
                                            <TableCell column={AGING_COLUMNS.days61To90}>
                                                <Text style={common.text}>{p.unitsByAge.days61To90}</Text>
                                            </TableCell>
                                            <TableCell column={AGING_COLUMNS.over90}>
                                                <Text style={[common.text, p.unitsByAge.over90Days > 0 && styles.warning]}>
                                                    {p.unitsByAge.over90Days}
                                                </Text>
                                            </TableCell>
                                            <TableCell column={AGING_COLUMNS.averageAge}>
                                                <Text style={common.text}>{formatNumber(p.averageAgeDays, ' d')}</Text>
                                            </TableCell>
                                            <TableCell column={AGING_COLUMNS.oldest}>
                                                <Text style={common.text}>{formatNumber(p.oldestUnitAgeDays, ' d')}</Text>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </View>
                            )}
                        </View>
                    </>
                )}
            </LoadState>
        </ScrollView>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
            <Text style={common.tableHeader}>{label}</Text>
            <Text style={styles.tileValue}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    link: { color: colors.primary, fontWeight: '600' },
    strong: { fontWeight: '600' },
    warning: { color: colors.warning, fontWeight: '600' },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    tile: {
        minWidth: 120,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        gap: 4,
    },
    tileValue: { fontSize: 20, fontWeight: '600', color: colors.text },
});

const LOW_STOCK_COLUMNS = {
    product: { label: 'Product', wide: true },
    level: { label: 'Level' },
    onHand: { label: 'On hand', numeric: true },
    reserved: { label: 'Reserved', numeric: true },
    available: { label: 'Available', numeric: true },
    threshold: { label: 'Threshold', numeric: true },
} satisfies Record<string, Column>;

const AGING_COLUMNS = {
    product: { label: 'Product', wide: true },
    onHand: { label: 'On hand', numeric: true },
    days0To30: { label: '0–30 d', numeric: true },
    days31To60: { label: '31–60 d', numeric: true },
    days61To90: { label: '61–90 d', numeric: true },
    over90: { label: '> 90 d', numeric: true },
    averageAge: { label: 'Avg age', numeric: true },
    oldest: { label: 'Oldest', numeric: true },
} satisfies Record<string, Column>;
