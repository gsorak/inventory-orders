import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../theme';
import { acceptInput, type InputFormat } from '../utils/validation';

interface FieldProps {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    error?: string;
    placeholder?: string;
    /** Edits that would not fit the format are ignored, and a numeric keyboard is shown. */
    format?: InputFormat;
    maxLength?: number;
    width?: number;
    /** Defaults to `label`; use it when the visible label alone does not identify the field. */
    accessibilityLabel?: string;
    /** When false, `error` only marks the input; the caller shows the message elsewhere. */
    showErrorText?: boolean;
}

/** Labelled text input with an inline validation message. */
export function Field({
    label,
    value,
    onChangeText,
    error,
    placeholder,
    format,
    maxLength,
    width,
    accessibilityLabel,
    showErrorText = true,
}: FieldProps) {
    const changeText = (text: string) => {
        const accepted = format ? acceptInput(format, text) : text;
        if (accepted !== undefined) {
            onChangeText(accepted);
        }
    };

    return (
        <View style={[styles.field, width !== undefined && { width }]}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                accessibilityLabel={accessibilityLabel ?? label}
                value={value}
                onChangeText={changeText}
                placeholder={placeholder}
                placeholderTextColor={colors.placeholder}
                inputMode={format === 'amount' ? 'decimal' : format === 'integer' ? 'numeric' : undefined}
                maxLength={maxLength}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, error !== undefined && styles.inputError]}
            />
            {error !== undefined && showErrorText && <Text style={styles.error}>{error}</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    field: { gap: 4, minWidth: 90 },
    label: { fontSize: 13, color: colors.muted },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 7,
        fontSize: 14,
        backgroundColor: colors.surface,
        color: colors.text,
    },
    inputError: { borderColor: colors.danger },
    error: { fontSize: 12, color: colors.danger },
});
