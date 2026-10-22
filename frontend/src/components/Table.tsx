import type { ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, common } from '../theme';

/** Below this window width, table rows are shown as cards with a label on every value. */
export const COMPACT_TABLE_WIDTH = 960;

export interface Column {
    /** Header text; also the value's label in compact cards (empty for an action column). */
    label: string;
    wide?: boolean;
    numeric?: boolean;
}

export function useCompactTables(): boolean {
    return useWindowDimensions().width < COMPACT_TABLE_WIDTH;
}

export function TableHeader({ columns }: { columns: readonly Column[] }) {
    if (useCompactTables()) {
        return null;
    }
    return (
        <View style={common.tableRow}>
            {columns.map((c, index) => (
                <Text key={index} style={[c.wide ? common.wideCell : common.cell, common.tableHeader, c.numeric && styles.right]}>
                    {c.label}
                </Text>
            ))}
        </View>
    );
}

export function TableRow({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
    return (
        <View testID={testID} style={[useCompactTables() ? styles.card : common.tableRow, style]}>
            {children}
        </View>
    );
}

export function TableCell({ column, children }: { column: Column; children: ReactNode }) {
    if (useCompactTables()) {
        return (
            <View style={column.wide || column.label === '' ? styles.compactWide : styles.compactCell}>
                {column.label !== '' && <Text style={common.tableHeader}>{column.label}</Text>}
                {children}
            </View>
        );
    }
    return (
        <View style={[column.wide ? common.wideCell : common.cell, styles.cell, column.numeric && styles.numeric]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    right: { textAlign: 'right' },
    cell: { gap: 2 },
    numeric: { alignItems: 'flex-end' },
    card: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 10,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
    },
    compactWide: { flexBasis: '100%', gap: 2 },
    compactCell: { flexGrow: 1, flexBasis: '40%', minWidth: 110, gap: 2 },
});
