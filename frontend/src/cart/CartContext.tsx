import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { CreateReservationRequest, Product } from '../api/types';
import { loadJson, saveJson } from '../utils/storage';
import { addToCart, parseCart, refreshCart, removeFromCart, setLineQuantity, type Cart } from './cart';
import {
    checkoutKeyFor,
    discardCheckout,
    finishCheckout,
    loadCheckout,
    recordReservation,
    renewCheckoutKey,
    type CheckoutRecord,
} from './checkout';

const STORAGE_KEY = 'inventory-orders.cart';

interface CartContextValue {
    cart: Cart;
    /** The checkout in progress; while set, the cart cannot be edited. */
    checkout: CheckoutRecord | undefined;
    add: (product: Product, quantity: number) => void;
    setQuantity: (productId: number, quantity: number) => void;
    remove: (productId: number) => void;
    clear: () => void;
    refresh: (products: Product[]) => void;
    /** Locks the cart and returns the Idempotency-Key for reserving `request`. */
    beginCheckout: (request: CreateReservationRequest) => string;
    /** A new key for the same request, after its earlier reservation expired or was cancelled. */
    restartCheckout: (request: CreateReservationRequest) => string;
    reservationCreated: (reservationId: number) => void;
    /** Unlocks the cart and keeps its contents; without an id, forgets an attempt that reserved nothing. */
    endCheckout: (reservationId?: number) => void;
    /** Unlocks the cart after the payment for its reservation and empties it, whatever it holds now. */
    completeCheckout: (reservationId: number) => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

/** Cart state for the customer pages; kept in the browser only and never reserves stock. */
export function CartProvider({ children }: { children: ReactNode }) {
    const [cart, setCart] = useState<Cart>(() => parseCart(loadJson(STORAGE_KEY)));
    const [checkout, setCheckout] = useState(loadCheckout);
    // Stable actions, so screens can use them as effect dependencies.
    const [actions] = useState(() => {
        // Edits are ignored while a checkout is in progress, even if a screen still offers them.
        const edit = (change: (c: Cart) => Cart) => {
            if (!loadCheckout()) {
                setCart(change);
            }
        };
        const sync = () => setCheckout(loadCheckout());
        return {
            add: (product: Product, quantity: number) => edit((c) => addToCart(c, product, quantity)),
            setQuantity: (productId: number, quantity: number) => edit((c) => setLineQuantity(c, productId, quantity)),
            remove: (productId: number) => edit((c) => removeFromCart(c, productId)),
            clear: () => edit(() => []),
            refresh: (products: Product[]) => setCart((c) => refreshCart(c, products)),
            beginCheckout: (request: CreateReservationRequest) => {
                const key = checkoutKeyFor(request);
                sync();
                return key;
            },
            restartCheckout: (request: CreateReservationRequest) => {
                const key = renewCheckoutKey(request);
                sync();
                return key;
            },
            reservationCreated: (reservationId: number) => {
                recordReservation(reservationId);
                sync();
            },
            endCheckout: (reservationId?: number) => {
                if (reservationId === undefined) {
                    discardCheckout();
                } else {
                    finishCheckout(reservationId);
                }
                sync();
            },
            completeCheckout: (reservationId: number) => {
                // The checkout record, not the cart contents, links the cart to the paid reservation.
                const paidForCart = loadCheckout()?.reservationId === reservationId;
                finishCheckout(reservationId);
                sync();
                if (paidForCart) {
                    setCart([]);
                }
            },
        };
    });

    useEffect(() => {
        saveJson(STORAGE_KEY, cart);
    }, [cart]);

    const value = useMemo<CartContextValue>(() => ({ cart, checkout, ...actions }), [cart, checkout, actions]);
    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
    const value = useContext(CartContext);
    if (!value) {
        throw new Error('useCart must be used inside CartProvider');
    }
    return value;
}
