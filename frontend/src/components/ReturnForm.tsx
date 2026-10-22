import { useState } from 'react';
import { Text, View } from 'react-native';

import {
    ITEM_CONDITIONS,
    RETURN_REASONS,
    type CreateReturnRequest,
    type ItemCondition,
    type Order,
    type Product,
    type ReturnReason,
} from '../api/types';
import { common } from '../theme';
import { productLabel } from '../utils/products';
import { Button } from './Button';
import { ChoiceGroup } from './ChoiceGroup';
import { QuantitySelect } from './QuantitySelect';

interface ReturnFormProps {
    order: Order;
    products: Product[];
    busy: boolean;
    /** Resolves to true when the return was recorded, which clears the form. */
    onSubmit: (request: CreateReturnRequest) => Promise<boolean>;
}

export function ReturnForm({ order, products, busy, onSubmit }: ReturnFormProps) {
    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const [reasons, setReasons] = useState<Record<number, ReturnReason>>({});
    const [conditions, setConditions] = useState<Record<number, ItemCondition>>({});

    const deliveredItems = order.items.filter((i) => i.deliveredQuantity > 0);
    if (deliveredItems.length === 0) {
        return <Text style={common.muted}>Returns become possible once units have been delivered.</Text>;
    }

    const lines = deliveredItems.map((item) => {
        const returnable = Math.max(item.deliveredQuantity - item.returnedQuantity, 0);
        return {
            item,
            returnable,
            selected: Math.min(quantities[item.id] ?? 0, returnable),
            reason: reasons[item.id] ?? 'NO_LONGER_NEEDED',
            condition: conditions[item.id] ?? 'UNOPENED',
        };
    });
    const total = lines.reduce((sum, line) => sum + line.selected, 0);

    const submit = async () => {
        const items = lines
            .filter((l) => l.selected > 0)
            .map((l) => ({ orderItemId: l.item.id, quantity: l.selected, reason: l.reason, condition: l.condition }));
        if (items.length === 0) {
            return;
        }
        const created = await onSubmit({ items });
        if (created) {
            setQuantities({});
            setReasons({});
            setConditions({});
        }
    };

    return (
        <View style={{ gap: 8 }}>
            {lines.map(({ item, returnable, selected, reason, condition }) => {
                const label = productLabel(products, item.productId);
                return (
                    <View key={item.id} style={[common.tableRow, { alignItems: 'flex-start' }]}>
                        <View style={[common.wideCell, { gap: 2 }]}>
                            <Text style={common.text}>{label}</Text>
                            <Text style={common.muted}>
                                {returnable > 0
                                    ? `${returnable} of ${item.deliveredQuantity} delivered units can be returned`
                                    : `All ${item.deliveredQuantity} delivered units returned`}
                            </Text>
                        </View>
                        {returnable > 0 && (
                            <QuantitySelect
                                label="Quantity to return"
                                accessibilityLabel={`Quantity to return of ${label}`}
                                max={returnable}
                                value={selected}
                                onChange={(v) => setQuantities({ ...quantities, [item.id]: v })}
                                disabled={busy}
                            />
                        )}
                        {selected > 0 && (
                            <View style={[common.wideCell, { gap: 6 }]}>
                                <ChoiceGroup
                                    label="Reason"
                                    accessibilityLabel={`Reason for ${label}`}
                                    options={RETURN_REASONS}
                                    value={reason}
                                    onChange={(v) => setReasons({ ...reasons, [item.id]: v })}
                                />
                                <ChoiceGroup
                                    label="Condition"
                                    accessibilityLabel={`Condition of ${label}`}
                                    options={ITEM_CONDITIONS}
                                    value={condition}
                                    onChange={(v) => setConditions({ ...conditions, [item.id]: v })}
                                />
                            </View>
                        )}
                    </View>
                );
            })}
            {total === 0 && <Text style={common.muted}>Choose at least one unit to return.</Text>}
            <Button label="Record return" busyLabel="Recording…" onPress={submit} busy={busy} disabled={total === 0} />
        </View>
    );
}
