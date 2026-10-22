import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

interface QuantitySelectProps {
    /** Visible caption above the dropdown. */
    label: string;
    /** Accessible name; more specific than the caption when several dropdowns share it. */
    accessibilityLabel: string;
    max: number;
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
}

/** Dropdown for a whole number from 0 to `max`: a native select on the web, an expanding list elsewhere. */
export function QuantitySelect({ label, accessibilityLabel, max, value, onChange, disabled = false }: QuantitySelectProps) {
    const [open, setOpen] = useState(false);
    const options = Array.from({ length: max + 1 }, (_, i) => i);

    return (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            {Platform.OS === 'web' ? (
                <select
                    aria-label={accessibilityLabel}
                    value={String(value)}
                    disabled={disabled}
                    onChange={(e) => onChange(Number(e.currentTarget.value))}
                    style={webSelect}
                >
                    {options.map((option) => (
                        <option key={option} value={String(option)}>
                            {option}
                        </option>
                    ))}
                </select>
            ) : (
                <>
                    <Pressable
                        onPress={() => setOpen(!open)}
                        disabled={disabled}
                        accessibilityRole="combobox"
                        accessibilityLabel={accessibilityLabel}
                        accessibilityValue={{ text: String(value) }}
                        accessibilityState={{ expanded: open, disabled }}
                        style={styles.box}
                    >
                        <Text style={styles.value}>{value}</Text>
                        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
                    </Pressable>
                    {open && (
                        <ScrollView style={styles.list} nestedScrollEnabled>
                            {options.map((option) => (
                                <Pressable
                                    key={option}
                                    onPress={() => {
                                        onChange(option);
                                        setOpen(false);
                                    }}
                                    accessibilityRole="menuitem"
                                    accessibilityLabel={String(option)}
                                    accessibilityState={{ selected: option === value }}
                                    style={[styles.option, option === value && styles.selected]}
                                >
                                    <Text style={styles.value}>{option}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    )}
                </>
            )}
        </View>
    );
}

const webSelect = {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: 6,
    padding: '7px 10px',
    fontSize: 14,
    backgroundColor: colors.surface,
    color: colors.text,
    minWidth: 90,
} as const;

const styles = StyleSheet.create({
    field: { gap: 4, minWidth: 90 },
    label: { fontSize: 13, color: colors.muted },
    box: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 7,
        backgroundColor: colors.surface,
    },
    value: { fontSize: 14, color: colors.text },
    chevron: { fontSize: 10, color: colors.muted },
    list: {
        maxHeight: 180,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 6,
        backgroundColor: colors.surface,
    },
    option: { paddingHorizontal: 10, paddingVertical: 6 },
    selected: { backgroundColor: '#e3ecfb' },
});
