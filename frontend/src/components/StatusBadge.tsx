import { StyleSheet, Text } from 'react-native';

import { colors } from '../theme';
import { formatEnum } from '../utils/format';

const palette: Record<string, { background: string; color: string }> = {
    ACTIVE: { background: '#e3f2fd', color: '#0d47a1' },
    CONFIRMED: { background: '#e8f5e9', color: colors.success },
    CANCELLED: { background: '#eceff1', color: '#455a64' },
    EXPIRED: { background: '#fdecea', color: colors.danger },
    IN_FULFILMENT: { background: '#fff8e1', color: colors.warning },
    PACKED: { background: '#fff8e1', color: colors.warning },
    SHIPPED: { background: '#e3f2fd', color: '#0d47a1' },
    DELIVERED: { background: '#e8f5e9', color: colors.success },
    RESTOCK: { background: '#e8f5e9', color: colors.success },
    DISCARD: { background: '#fdecea', color: colors.danger },
    IN_STOCK: { background: '#e8f5e9', color: colors.success },
    LOW_STOCK: { background: '#fff8e1', color: colors.warning },
    OUT_OF_STOCK: { background: '#fdecea', color: colors.danger },
};

/** `subject` (e.g. "Shipment") prefixes the text, so order, shipment and reservation statuses are not confused. */
export function StatusBadge({ status, subject }: { status: string; subject?: string }) {
    const { background, color } = palette[status] ?? { background: '#eceff1', color: colors.text };
    return (
        <Text style={[styles.badge, { backgroundColor: background, color }]} accessibilityLabel={`Status ${status}`}>
            {subject ? `${subject}: ${formatEnum(status)}` : formatEnum(status)}
        </Text>
    );
}

const styles = StyleSheet.create({
    badge: {
        alignSelf: 'flex-start',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
        fontSize: 12,
        fontWeight: '600',
        overflow: 'hidden',
    },
});
