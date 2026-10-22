import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '../theme';

interface ButtonProps {
    label: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
    /** While busy the button is disabled and shows `busyLabel`, preventing duplicate submissions. */
    busy?: boolean;
    busyLabel?: string;
    accessibilityLabel?: string;
}

export function Button({
    label,
    onPress,
    variant = 'primary',
    disabled = false,
    busy = false,
    busyLabel = 'Working…',
    accessibilityLabel,
}: ButtonProps) {
    const inactive = disabled || busy;
    return (
        <Pressable
            onPress={onPress}
            disabled={inactive}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{ disabled: inactive, busy }}
            style={[styles.button, styles[variant], inactive && styles.inactive]}
        >
            <Text style={[styles.label, variant === 'secondary' && styles.secondaryLabel]}>{busy ? busyLabel : label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        borderRadius: 6,
        paddingVertical: 8,
        paddingHorizontal: 14,
        alignItems: 'center',
        alignSelf: 'flex-start',
    },
    primary: { backgroundColor: colors.primary },
    danger: { backgroundColor: colors.danger },
    secondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    inactive: { opacity: 0.5 },
    label: { color: '#fff', fontSize: 14, fontWeight: '600' },
    secondaryLabel: { color: colors.text },
});
