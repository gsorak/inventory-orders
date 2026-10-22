import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { errorMessage, ordersApi, productsApi, shipmentsApi } from '../api/client';
import type {
    CreateReturnRequest,
    CreateShipmentRequest,
    Order,
    OrderReturn,
    Product,
    Shipment,
} from '../api/types';
import { Banner, type BannerMessage } from '../components/Banner';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { LoadState } from '../components/LoadState';
import { PackShipmentForm } from '../components/PackShipmentForm';
import { ReturnForm } from '../components/ReturnForm';
import { StatusBadge } from '../components/StatusBadge';
import { TableCell, TableHeader, TableRow, type Column } from '../components/Table';
import type { Mode } from '../navigation';
import { colors, common } from '../theme';
import { formatDateTime, formatEnum, formatMoney } from '../utils/format';
import { useIdempotencyKeys } from '../utils/idempotency';
import { canPack, canReturn, changedOrderValues, nextOrderStep } from '../utils/orders';
import { productLabel } from '../utils/products';

interface OrderData {
    order: Order;
    shipments: Shipment[];
    returns: OrderReturn[];
    products: Product[];
}

type FormDialog = 'pack' | 'return';

const ITEM_COLUMNS = {
    product: { label: 'Product', wide: true },
    price: { label: 'Price', numeric: true },
    ordered: { label: 'Ordered', numeric: true },
    packed: { label: 'Packed', numeric: true },
    shipped: { label: 'Shipped', numeric: true },
    delivered: { label: 'Delivered', numeric: true },
    returned: { label: 'Returned', numeric: true },
    lineTotal: { label: 'Line total', numeric: true },
} satisfies Record<string, Column>;

/** Administrators fulfil and return orders; customers get a read-only view of the same order. */
export default function OrderDetailsScreen({ mode }: { mode: Mode }) {
    const admin = mode === 'admin';
    const listHref = admin ? '/admin/orders' : '/orders';
    const params = useLocalSearchParams<{ id: string; confirmed?: string }>();
    const orderId = Number(params.id);
    const shipmentKeys = useIdempotencyKeys();
    const returnKeys = useIdempotencyKeys();

    const [data, setData] = useState<OrderData>();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>();
    const [message, setMessage] = useState<BannerMessage | undefined>(
        params.confirmed ? { kind: 'success', text: `Payment confirmed: order #${params.id} was created.` } : undefined
    );
    const [changed, setChanged] = useState<Set<string>>(new Set());
    const [changedShipmentId, setChangedShipmentId] = useState<number>();
    const [changedReturnId, setChangedReturnId] = useState<number>();
    const [busyAction, setBusyAction] = useState<string>();
    const [dialog, setDialog] = useState<FormDialog>();

    const load = useCallback(
        async (previous?: Order) => {
            setLoading(true);
            setLoadError(undefined);
            try {
                const [order, shipments, returns, products] = await Promise.all([
                    ordersApi.get(orderId),
                    ordersApi.shipments(orderId),
                    ordersApi.returns(orderId),
                    productsApi.list(),
                ]);
                setData({ order, shipments, returns, products });
                setChanged(changedOrderValues(previous, order));
                return order;
            } catch (e) {
                setLoadError(errorMessage(e, 'Failed to load the order.'));
                return undefined;
            } finally {
                setLoading(false);
            }
        },
        [orderId]
    );

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    /**
     * Runs one operation at a time, then reloads and highlights what changed. A successful dialog operation
     * closes its dialog; a failed one keeps it open with the error shown inside.
     */
    const run = async (action: string, operation: () => Promise<string>, failure: string): Promise<boolean> => {
        setBusyAction(action);
        setMessage(undefined);
        let succeeded = false;
        try {
            const text = await operation();
            setMessage({ kind: 'success', text });
            setDialog(undefined);
            succeeded = true;
        } catch (e) {
            setMessage({ kind: 'error', text: errorMessage(e, failure) });
        }
        await load(data?.order);
        setBusyAction(undefined);
        return succeeded;
    };

    const packShipment = (request: CreateShipmentRequest) =>
        run(
            'pack',
            async () => {
                const shipment = await ordersApi.createShipment(orderId, request, shipmentKeys.keyFor(request));
                shipmentKeys.complete();
                setChangedShipmentId(shipment.id);
                return `Shipment #${shipment.id} packed. Ship it next.`;
            },
            'Failed to pack the shipment.'
        );

    const ship = (shipment: Shipment) =>
        run(
            `ship-${shipment.id}`,
            async () => {
                await shipmentsApi.ship(shipment.id);
                setChangedShipmentId(shipment.id);
                return `Shipment #${shipment.id} shipped. Its units left on-hand and reserved stock.`;
            },
            'Failed to ship the shipment.'
        );

    const deliver = (shipment: Shipment) =>
        run(
            `deliver-${shipment.id}`,
            async () => {
                await shipmentsApi.deliver(shipment.id);
                setChangedShipmentId(shipment.id);
                return `Shipment #${shipment.id} delivered. Its units can now be returned.`;
            },
            'Failed to deliver the shipment.'
        );

    const recordReturn = (request: CreateReturnRequest) =>
        run(
            'return',
            async () => {
                const result = await ordersApi.createReturn(orderId, request, returnKeys.keyFor(request));
                returnKeys.complete();
                setChangedReturnId(result.id);
                const outcomes = result.items
                    .map((i) => `${i.quantity} × ${productLabel(data?.products ?? [], i.productId)} ${i.disposition === 'RESTOCK' ? 'restocked' : 'discarded'}`)
                    .join(', ');
                return `Return #${result.id} recorded: ${outcomes}. Credit note ${result.creditNote.number} issued for ${formatMoney(result.creditNote.amount)}.`;
            },
            'Failed to record the return.'
        );

    const openDialog = (which: FormDialog) => {
        setMessage(undefined);
        setDialog(which);
    };

    const highlight = (key: string) => (changed.has(key) ? common.highlight : undefined);

    if (!data) {
        return (
            <ScrollView contentContainerStyle={common.screen}>
                <Link href={listHref} style={{ color: colors.primary }}>
                    ← Orders
                </Link>
                <LoadState loading={loading} error={loadError} onRetry={() => load()} empty="">
                    {null}
                </LoadState>
            </ScrollView>
        );
    }

    const { order, shipments, returns, products } = data;
    const busy = busyAction !== undefined;
    const toShip = shipments.filter((s) => s.status === 'PACKED');
    const toDeliver = shipments.filter((s) => s.status === 'SHIPPED');
    const packable = canPack(order);
    const returnable = canReturn(order);
    const dialogError = dialog && message?.kind === 'error' ? message : undefined;

    return (
        <ScrollView contentContainerStyle={common.screen}>
            <Link href={listHref} style={{ color: colors.primary }}>
                ← Orders
            </Link>

            {message && !dialogError && <Banner {...message} onDismiss={() => setMessage(undefined)} />}
            {loadError && <Banner kind="error" text={loadError} />}

            <View style={common.card} testID="order-summary">
                <View style={[common.row, { justifyContent: 'space-between' }]}>
                    <View style={common.row}>
                        <Text style={common.heading}>{`Order #${order.id}`}</Text>
                        <View style={highlight('status')}>
                            <StatusBadge status={order.status} subject="Order" />
                        </View>
                    </View>
                    <Button label="Refresh" variant="secondary" onPress={() => load(order)} busy={loading} busyLabel="Refreshing…" />
                </View>
                <View style={common.row}>
                    {admin ? (
                        <Link
                            href={{ pathname: '/admin/reservations/[id]', params: { id: String(order.reservationId) } }}
                            style={{ color: colors.primary }}
                        >
                            {`Reservation #${order.reservationId}`}
                        </Link>
                    ) : (
                        <Text style={common.muted}>{`Reservation #${order.reservationId}`}</Text>
                    )}
                    <Text style={common.muted}>{`Payment ${order.paymentReference}`}</Text>
                    <Text style={common.muted}>{`Confirmed ${formatDateTime(order.confirmedAt)}`}</Text>
                    <Text style={common.muted}>{`Delivered ${formatDateTime(order.deliveredAt)}`}</Text>
                </View>
                <View style={common.row}>
                    <Text style={[common.subheading, highlight('grossTotal')]}>{`Gross ${formatMoney(order.grossTotal)}`}</Text>
                    <Text style={[common.subheading, highlight('creditedTotal')]} accessibilityLabel={`Credited ${formatMoney(order.creditedTotal)}`}>
                        {`Credited ${formatMoney(order.creditedTotal)}`}
                    </Text>
                    <Text style={[common.subheading, highlight('netTotal')]} accessibilityLabel={`Net ${formatMoney(order.netTotal)}`}>
                        {`Net ${formatMoney(order.netTotal)}`}
                    </Text>
                </View>
                {!admin && (
                    <Text style={common.muted}>Shipments, deliveries and returns appear here as the store processes your order.</Text>
                )}

                <View>
                    <TableHeader columns={Object.values(ITEM_COLUMNS)} />
                    {order.items.map((item) => (
                        <TableRow key={item.id} testID={`order-item-${item.id}`}>
                            <TableCell column={ITEM_COLUMNS.product}>
                                <Text style={common.text}>{productLabel(products, item.productId)}</Text>
                            </TableCell>
                            <TableCell column={ITEM_COLUMNS.price}>
                                <Text style={common.text}>{formatMoney(item.unitPrice)}</Text>
                            </TableCell>
                            <TableCell column={ITEM_COLUMNS.ordered}>
                                <Text style={common.text}>{item.quantity}</Text>
                            </TableCell>
                            <TableCell column={ITEM_COLUMNS.packed}>
                                <Text style={[common.text, highlight(`${item.id}.packedQuantity`)]} accessibilityLabel={`Packed ${item.packedQuantity}`}>
                                    {item.packedQuantity}
                                </Text>
                            </TableCell>
                            <TableCell column={ITEM_COLUMNS.shipped}>
                                <Text style={[common.text, highlight(`${item.id}.shippedQuantity`)]} accessibilityLabel={`Shipped ${item.shippedQuantity}`}>
                                    {item.shippedQuantity}
                                </Text>
                            </TableCell>
                            <TableCell column={ITEM_COLUMNS.delivered}>
                                <Text style={[common.text, highlight(`${item.id}.deliveredQuantity`)]} accessibilityLabel={`Delivered ${item.deliveredQuantity}`}>
                                    {item.deliveredQuantity}
                                </Text>
                            </TableCell>
                            <TableCell column={ITEM_COLUMNS.returned}>
                                <Text style={[common.text, highlight(`${item.id}.returnedQuantity`)]} accessibilityLabel={`Returned ${item.returnedQuantity}`}>
                                    {item.returnedQuantity}
                                </Text>
                            </TableCell>
                            <TableCell column={ITEM_COLUMNS.lineTotal}>
                                <Text style={common.text}>{formatMoney(item.lineTotal)}</Text>
                            </TableCell>
                        </TableRow>
                    ))}
                </View>
            </View>

            {admin && (
                <View style={[common.card, { borderColor: colors.primary }]} testID="next-actions">
                    <Text style={common.heading}>Next actions</Text>
                    <Text style={common.text}>{nextOrderStep(order, shipments)}</Text>
                    <View style={common.row}>
                        {toShip.map((s) => (
                            <Button
                                key={`ship-${s.id}`}
                                label={`Ship shipment #${s.id}`}
                                accessibilityLabel={`Ship shipment ${s.id}`}
                                busyLabel="Shipping…"
                                onPress={() => ship(s)}
                                busy={busyAction === `ship-${s.id}`}
                                disabled={busy}
                            />
                        ))}
                        {toDeliver.map((s) => (
                            <Button
                                key={`deliver-${s.id}`}
                                label={`Deliver shipment #${s.id}`}
                                accessibilityLabel={`Deliver shipment ${s.id}`}
                                busyLabel="Delivering…"
                                onPress={() => deliver(s)}
                                busy={busyAction === `deliver-${s.id}`}
                                disabled={busy}
                            />
                        ))}
                        {packable && (
                            <Button
                                label="Pack shipment…"
                                variant={toShip.length + toDeliver.length > 0 ? 'secondary' : 'primary'}
                                onPress={() => openDialog('pack')}
                                disabled={busy}
                            />
                        )}
                        {returnable && (
                            <Button label="Record return…" variant="secondary" onPress={() => openDialog('return')} disabled={busy} />
                        )}
                    </View>
                    {toShip.length + toDeliver.length === 0 && !packable && !returnable && (
                        <Text style={common.muted}>No fulfilment or return actions remain for this order.</Text>
                    )}
                </View>
            )}

            <View style={common.card}>
                <Text style={common.heading}>Shipments</Text>
                {shipments.length === 0 && <Text style={common.muted}>No shipments yet.</Text>}
                {shipments.map((s) => (
                    <View
                        key={s.id}
                        style={[common.tableRow, { alignItems: 'flex-start' }, s.id === changedShipmentId && common.highlight]}
                        testID={`shipment-${s.id}`}
                    >
                        <View style={[common.cell, { gap: 4 }]}>
                            <Text style={common.subheading}>{`Shipment #${s.id}`}</Text>
                            <StatusBadge status={s.status} subject="Shipment" />
                        </View>
                        <View style={[common.wideCell, { gap: 2 }]}>
                            {s.items.map((i) => (
                                <Text key={i.orderItemId} style={common.text}>{`${i.quantity} × ${productLabel(products, i.productId)}`}</Text>
                            ))}
                        </View>
                        <View style={[common.wideCell, { gap: 2 }]}>
                            <Text style={common.muted}>{`Packed ${formatDateTime(s.packedAt)}`}</Text>
                            <Text style={common.muted}>{`Shipped ${formatDateTime(s.shippedAt)}`}</Text>
                            <Text style={common.muted}>{`Delivered ${formatDateTime(s.deliveredAt)}`}</Text>
                        </View>
                    </View>
                ))}
            </View>

            <View style={common.card}>
                <Text style={common.heading}>Returns and credit notes</Text>
                {returns.length === 0 && <Text style={common.muted}>No returns yet.</Text>}
                {returns.map((r) => (
                    <View
                        key={r.id}
                        style={[common.tableRow, { alignItems: 'flex-start' }, r.id === changedReturnId && common.highlight]}
                        testID={`return-${r.id}`}
                    >
                        <View style={[common.cell, { gap: 2 }]}>
                            <Text style={common.subheading}>{`Return #${r.id}`}</Text>
                            <Text style={common.muted}>{formatDateTime(r.returnedAt)}</Text>
                        </View>
                        <View style={[common.wideCell, { gap: 4 }]}>
                            {r.items.map((i, index) => (
                                <View key={index} style={common.row}>
                                    <Text style={common.text}>
                                        {`${i.quantity} × ${productLabel(products, i.productId)} · ${formatEnum(i.reason)} · ${formatEnum(i.condition)} · refund ${formatMoney(i.refundAmount)}`}
                                    </Text>
                                    <StatusBadge status={i.disposition} />
                                </View>
                            ))}
                        </View>
                        <View style={[common.cell, { gap: 2 }]}>
                            <Text style={common.subheading}>{r.creditNote.number}</Text>
                            <Text style={common.text}>{formatMoney(r.creditNote.amount)}</Text>
                        </View>
                    </View>
                ))}
            </View>

            {admin && (
                <>
                    <Dialog
                        visible={dialog === 'pack'}
                        title={`Pack a shipment for order #${order.id}`}
                        description="Choose the units to pack for each product. Choose fewer for a partial shipment, or 0 to leave a product out; the rest can follow later."
                        busy={busyAction === 'pack'}
                        onClose={() => setDialog(undefined)}
                    >
                        {dialogError && <Banner {...dialogError} />}
                        <PackShipmentForm order={order} products={products} busy={busyAction === 'pack'} onSubmit={packShipment} />
                    </Dialog>
                    <Dialog
                        visible={dialog === 'return'}
                        title={`Record a return for order #${order.id}`}
                        description="Choose the quantity to return for each product, then its reason and condition. Unopened units are restocked; opened or damaged units are discarded. A credit note is issued for the refund."
                        busy={busyAction === 'return'}
                        onClose={() => setDialog(undefined)}
                    >
                        {dialogError && <Banner {...dialogError} />}
                        <ReturnForm order={order} products={products} busy={busyAction === 'return'} onSubmit={recordReturn} />
                    </Dialog>
                </>
            )}
        </ScrollView>
    );
}
