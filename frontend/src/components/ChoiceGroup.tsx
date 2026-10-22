import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import { formatEnum } from '../utils/format';

interface ChoiceGroupProps<T extends string> {
    label: string;
    /** Accessible name for the group and its options; defaults to `label`. */
    accessibilityLabel?: string;
    options: readonly T[];
    value: T;
    onChange: (value: T) => void;
    /** Option label; defaults to the formatted enum value. */
    formatOption?: (value: T) => string;
    error?: string;
}

/** Small single-choice selector (radio group) for enum values. */
export function ChoiceGroup<T extends string>({
    label,
    accessibilityLabel = label,
    options,
    value,
    onChange,
    formatOption = formatEnum,
    error,
}: ChoiceGroupProps<T>) {
    return (
        <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.options}>
                {options.map((option) => {
                    const selected = option === value;
                    return (
                        <Pressable
                            key={option}
                            onPress={() => onChange(option)}
                            accessibilityRole="radio"
                            aria-checked={selected}
                            accessibilityLabel={`${accessibilityLabel}: ${formatOption(option)}`}
                            style={[styles.option, selected && styles.selected]}
                        >
                            <Text style={[styles.optionText, selected && styles.selectedText]}>{formatOption(option)}</Text>
                        </Pressable>
                    );
                })}
            </View>
            {error !== undefined && <Text style={styles.error}>{error}</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    group: { gap: 4 },
    label: { fontSize: 13, color: colors.muted },
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    option: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: colors.surface,
    },
    selected: { borderColor: colors.primary, backgroundColor: '#e3ecfb' },
    optionText: { fontSize: 13, color: colors.text },
    selectedText: { color: colors.primary, fontWeight: '600' },
    error: { fontSize: 12, color: colors.danger },
});
