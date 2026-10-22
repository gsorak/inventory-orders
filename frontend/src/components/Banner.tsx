import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

export type BannerKind = 'success' | 'error' | 'info' | 'hint';

export interface BannerMessage {
    kind: BannerKind;
    text: string;
}

interface BannerProps extends BannerMessage {
    onDismiss?: () => void;
}

const titles: Record<BannerKind, string> = {
    success: 'Done',
    error: 'Not possible',
    info: 'Note',
    hint: 'Next step',
};

/** Confirmation, error, note or next-step hint shown above the affected content. */
export function Banner({ kind, text, onDismiss }: BannerProps) {
    return (
        <View
            style={[styles.banner, styles[kind]]}
            accessibilityRole={kind === 'error' ? 'alert' : 'summary'}
            accessibilityLiveRegion="polite"
            testID={`banner-${kind}`}
        >
            <View style={styles.body}>
                <Text style={styles.title}>{titles[kind]}</Text>
                <Text style={styles.text}>{text}</Text>
            </View>
            {onDismiss && (
                <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss message">
                    <Text style={styles.dismiss}>×</Text>
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        gap: 12,
        borderRadius: 6,
        borderLeftWidth: 4,
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    success: { backgroundColor: '#e8f5e9', borderLeftColor: colors.success },
    error: { backgroundColor: '#fdecea', borderLeftColor: colors.danger },
    info: { backgroundColor: '#eef3fb', borderLeftColor: colors.primary },
    hint: { backgroundColor: '#fff8e1', borderLeftColor: colors.warning },
    body: { flex: 1, gap: 2 },
    title: { fontSize: 13, fontWeight: '700', color: colors.text },
    text: { fontSize: 14, color: colors.text },
    dismiss: { fontSize: 20, color: colors.muted, paddingHorizontal: 4 },
});
