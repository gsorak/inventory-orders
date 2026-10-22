import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dialog } from '../components/Dialog';
import { OPEN_GUARD_MS } from '../components/useOpenGuard';

jest.unmock('../components/useOpenGuard');

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const settle = () => act(() => jest.advanceTimersByTime(OPEN_GUARD_MS));

describe('Dialog', () => {
    async function renderDialog(busy = false) {
        const onClose = jest.fn();
        const onSubmit = jest.fn();
        await render(
            <Dialog visible title="Record a return" busy={busy} onClose={onClose}>
                <Text>Form</Text>
                <Text onPress={onSubmit} accessibilityRole="button">
                    Submit form
                </Text>
            </Dialog>
        );
        return { onClose, onSubmit };
    }

    it('ignores presses right after opening, such as the second click of a double-click', async () => {
        const { onClose, onSubmit } = await renderDialog();

        await fireEvent.press(screen.getByLabelText('Dismiss dialog'));
        await fireEvent.press(screen.getByRole('button', { name: 'Submit form' }));
        await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

        expect(onClose).not.toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByText('Form')).toBeOnTheScreen();
    });

    it('responds to the backdrop and its buttons once it has been open for a moment', async () => {
        const { onClose, onSubmit } = await renderDialog();
        await settle();

        await fireEvent.press(screen.getByRole('button', { name: 'Submit form' }));
        await fireEvent.press(screen.getByLabelText('Dismiss dialog'));
        await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('does not close while busy', async () => {
        const { onClose } = await renderDialog(true);
        await settle();

        await fireEvent.press(screen.getByLabelText('Dismiss dialog'));
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe('ConfirmDialog', () => {
    async function renderConfirm(visible = true) {
        const onConfirm = jest.fn();
        const onCancel = jest.fn();
        const element = (open: boolean) => (
            <ConfirmDialog
                visible={open}
                title="Clear the cart?"
                message="All products are removed."
                confirmLabel="Clear cart"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );
        await render(element(visible));
        return { onConfirm, onCancel, rerender: (open: boolean) => screen.rerender(element(open)) };
    }

    it('ignores the backdrop and the confirm button right after opening', async () => {
        const { onConfirm, onCancel } = await renderConfirm();

        await fireEvent.press(screen.getByLabelText('Dismiss dialog'));
        await fireEvent.press(screen.getByRole('button', { name: 'Clear cart' }));

        expect(onCancel).not.toHaveBeenCalled();
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('confirms or dismisses once settled, and guards again when reopened', async () => {
        const { onConfirm, onCancel, rerender } = await renderConfirm();
        await settle();

        await fireEvent.press(screen.getByRole('button', { name: 'Clear cart' }));
        await fireEvent.press(screen.getByLabelText('Dismiss dialog'));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onCancel).toHaveBeenCalledTimes(1);

        await rerender(false);
        await rerender(true);
        await fireEvent.press(screen.getByRole('button', { name: 'Clear cart' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
});
