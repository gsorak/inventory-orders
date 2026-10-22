import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import { Banner } from './Banner';
import { Button } from './Button';

interface LoadStateProps {
    loading: boolean;
    error?: string;
    onRetry: () => void;
    /** Shown instead of the children when loading succeeded but there is nothing to show. */
    empty?: string;
    children: ReactNode;
}

/**
 * Consistent loading / error / empty handling. Content stays visible while it is being refreshed, so state
 * changes after an operation can be observed in place.
 */
export function LoadState({ loading, error, onRetry, empty, children }: LoadStateProps) {
    if (error) {
        return (
            <View style={styles.box}>
                <Banner kind="error" text={error} />
                <Button label="Retry" variant="secondary" onPress={onRetry} busy={loading} busyLabel="Retrying…" />
            </View>
        );
    }
    if (empty !== undefined) {
        return loading ? <Loading /> : <Text style={styles.empty}>{empty}</Text>;
    }
    return <>{children}</>;
}

export function Loading() {
    return (
        <View style={styles.loading} accessibilityLabel="Loading">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.empty}>Loading…</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    box: { gap: 8 },
    loading: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 12 },
    empty: { color: colors.muted, fontSize: 14, paddingVertical: 12 },
});
