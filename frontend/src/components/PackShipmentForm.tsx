import { useState } from 'react';
import { Text, View } from 'react-native';

import type { CreateShipmentRequest, Order, Product } from '../api/types';
import { common } from '../theme';
import { productLabel } from '../utils/products';
import { Button } from './Button';
import { QuantitySelect } from './QuantitySelect';

interface PackShipmentFormProps {
    order: Order;
    products: Product[];
    busy: boolean;
    /** Resolves to true when the shipment was created, which clears the form. */
    onSubmit: (request: CreateShipmentRequest) => Promise<boolean>;
}

export function PackShipmentForm({ order, products, busy, onSubmit }: PackShipmentFormProps) {
    // Only choices that differ from the default (all remaining units) are stored, so the defaults follow the reloaded order.
    const [quantities, setQuantities] = useState<Record<number, number>>({});

    if (order.status === 'DELIVERED') {
        return <Text style={common.muted}>Every ordered unit has been delivered, so there is nothing left to pack.</Text>;
    }

    const lines = order.items.map((item) => {
        const remaining = Math.max(item.quantity - item.packedQuantity, 0);
        return { item, remaining, selected: Math.min(quantities[item.id] ?? remaining, remaining) };
    });
    const total = lines.reduce((sum, line) => sum + line.selected, 0);

    const submit = async () => {
        const items = lines.filter((l) => l.selected > 0).map((l) => ({ orderItemId: l.item.id, quantity: l.selected }));
        if (items.length === 0) {
            return;
        }
        const created = await onSubmit({ items });
        if (created) {
            setQuantities({});
        }
    };

    return (
        <View style={{ gap: 8 }}>
            {lines.map(({ item, remaining, selected }) => {
                const label = productLabel(products, item.productId);
                return (
                    <View key={item.id} style={common.tableRow}>
                        <Text style={common.wideCell}>{label}</Text>
                        <Text style={common.cell}>
                            {remaining > 0 ? `${remaining} of ${item.quantity} not packed yet` : `All ${item.quantity} packed`}
                        </Text>
                        {remaining > 0 && (
                            <QuantitySelect
                                label="Units to pack"
                                accessibilityLabel={`Units to pack of ${label}`}
                                max={remaining}
                                value={selected}
                                onChange={(v) => setQuantities({ ...quantities, [item.id]: v })}
                                disabled={busy}
                            />
                        )}
                    </View>
                );
            })}
            {total === 0 && <Text style={common.muted}>Choose at least one unit to pack.</Text>}
            <Button label="Pack shipment" busyLabel="Packing…" onPress={submit} busy={busy} disabled={total === 0} />
        </View>
    );
}
