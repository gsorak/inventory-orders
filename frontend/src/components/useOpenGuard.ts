import { useEffect, useState } from 'react';

/**
 * Presses this soon after a popup opens are ignored: the second click of a double-click (or a quick repeated click)
 * on the opening button would otherwise land on the popup's backdrop or one of its buttons.
 */
export const OPEN_GUARD_MS = 600;

/** False from the moment `visible` becomes true until `OPEN_GUARD_MS` later. */
export function useOpenGuard(visible: boolean): boolean {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        if (!visible) {
            return;
        }
        const timer = setTimeout(() => setReady(true), OPEN_GUARD_MS);
        return () => {
            clearTimeout(timer);
            setReady(false);
        };
    }, [visible]);
    return ready;
}
