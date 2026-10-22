/**
 * Customer / Administration navigation. The mode is a demo convenience derived from the URL,
 * not a security boundary: every route is reachable directly.
 */
export type Mode = 'customer' | 'admin';

export const modes = {
    customer: {
        label: 'Customer',
        home: '/shop',
        sections: [
            { href: '/shop', label: 'Shop' },
            { href: '/cart', label: 'Cart' },
            { href: '/orders', label: 'Orders' },
        ],
    },
    admin: {
        label: 'Administration',
        home: '/admin/inventory',
        sections: [
            { href: '/admin/inventory', label: 'Inventory' },
            { href: '/admin/reservations', label: 'Reservations' },
            { href: '/admin/orders', label: 'Orders & Fulfilment' },
            { href: '/admin/reports', label: 'Reports' },
        ],
    },
} as const;

export const MODES: readonly Mode[] = ['customer', 'admin'];

export function isActive(href: string, pathname: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
}

/** The mode a path belongs to, or undefined for pages shared by both modes (e.g. the demo guide). */
export function modeForPath(pathname: string): Mode | undefined {
    if (isActive('/admin', pathname)) {
        return 'admin';
    }
    if (isActive('/checkout', pathname) || modes.customer.sections.some((s) => isActive(s.href, pathname))) {
        return 'customer';
    }
    return undefined;
}
