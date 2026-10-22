import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import { Button } from './Button';
import { useOpenGuard } from './useOpenGuard';

interface DialogProps {
    visible: boolean;
    title: string;
    description?: string;
    /** Closing is blocked while a request is running. */
    busy?: boolean;
    onClose: () => void;
    children: ReactNode;
    /** Primary action; forms that bring their own submit button can omit it. */
    submit?: { label: string; busyLabel: string; onPress: () => void };
    closeLabel?: string;
}

/** Modal panel for focused forms, so they are not permanently expanded on the page. */
export function Dialog({ visible, title, description, busy = false, onClose, children, submit, closeLabel = 'Cancel' }: DialogProps) {
    const ready = useOpenGuard(visible);

    const close = () => {
        if (!busy) {
            onClose();
        }
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
            <View style={styles.overlay}>
                {/* Sibling of the card, not a wrapper, to avoid nested <button>s on web. */}
                <Pressable style={StyleSheet.absoluteFill} onPress={ready ? close : undefined} accessibilityLabel="Dismiss dialog" />
                <View
                    style={[styles.card, !ready && styles.settling]}
                    accessibilityRole="none"
                    accessibilityLabel={title}
                    testID="dialog"
                >
                    <Text style={styles.title} accessibilityRole="header">
                        {title}
                    </Text>
                    {description && <Text style={styles.description}>{description}</Text>}
                    <ScrollView style={styles.body} contentContainerStyle={{ gap: 10 }}>
                        {children}
                    </ScrollView>
                    <View style={styles.actions}>
                        <Button label={closeLabel} variant="secondary" onPress={close} disabled={busy} />
                        {submit && <Button label={submit.label} busyLabel={submit.busyLabel} onPress={submit.onPress} busy={busy} />}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 10,
        padding: 20,
        width: '100%',
        maxWidth: 720,
        maxHeight: '90%',
        gap: 10,
        zIndex: 1,
    },
    settling: { pointerEvents: 'none' },
    title: { fontSize: 17, fontWeight: '600', color: colors.text },
    description: { fontSize: 14, color: colors.muted, lineHeight: 20 },
    body: { flexGrow: 0 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
});
