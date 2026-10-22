import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import { Button } from './Button';
import { useOpenGuard } from './useOpenGuard';

interface ConfirmDialogProps {
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

/** In-app confirmation for operations that cannot be undone. */
export function ConfirmDialog({ visible, title, message, confirmLabel, busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
    const ready = useOpenGuard(visible);
    const cancel = () => {
        if (!busy) {
            onCancel();
        }
    };
    // Also guarded for the keyboard: a repeated Enter must not confirm an operation that cannot be undone.
    const confirm = () => {
        if (ready) {
            onConfirm();
        }
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={cancel}>
            <View style={styles.overlay}>
                {/* Sibling of the card, not a wrapper, to avoid nested <button>s on web. */}
                <Pressable style={StyleSheet.absoluteFill} onPress={ready ? cancel : undefined} accessibilityLabel="Dismiss dialog" />
                <View style={[styles.card, !ready && styles.settling]} accessibilityRole="alert" accessibilityLabel={title}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.message}>{message}</Text>
                    <View style={styles.actions}>
                        <Button label="Keep" variant="secondary" onPress={cancel} disabled={busy} />
                        <Button label={confirmLabel} variant="danger" onPress={confirm} busy={busy} />
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
        padding: 24,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 10,
        padding: 20,
        width: '100%',
        maxWidth: 420,
        gap: 10,
        zIndex: 1,
    },
    settling: { pointerEvents: 'none' },
    title: { fontSize: 17, fontWeight: '600', color: colors.text },
    message: { fontSize: 14, color: colors.muted, lineHeight: 20 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
});
