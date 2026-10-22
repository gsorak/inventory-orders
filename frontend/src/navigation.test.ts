import { isActive, modeForPath } from './navigation';

describe('modeForPath', () => {
    it.each([
        ['/shop', 'customer'],
        ['/cart', 'customer'],
        ['/orders', 'customer'],
        ['/orders/7', 'customer'],
        ['/checkout/3', 'customer'],
        ['/admin', 'admin'],
        ['/admin/inventory', 'admin'],
        ['/admin/orders/7', 'admin'],
        ['/guide', undefined],
        ['/', undefined],
        ['/ordersx', undefined],
    ])('maps %s to %s', (path, mode) => {
        expect(modeForPath(path)).toBe(mode);
    });
});

describe('isActive', () => {
    it('matches the section and its sub-pages only', () => {
        expect(isActive('/admin/orders', '/admin/orders')).toBe(true);
        expect(isActive('/admin/orders', '/admin/orders/3')).toBe(true);
        expect(isActive('/orders', '/admin/orders')).toBe(false);
    });
});
