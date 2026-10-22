import { Link, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CartProvider, useCart } from '../cart/CartContext';
import { cartHref } from '../cart/checkout';
import { isActive, MODES, modeForPath, modes, type Mode } from '../navigation';
import { colors } from '../theme';

function CartBadge() {
    const count = useCart().cart.reduce((sum, line) => sum + line.quantity, 0);
    if (count === 0) {
        return null;
    }
    return (
        <Text style={styles.badge} accessibilityLabel={`${count} items in cart`} testID="cart-count">
            {count}
        </Text>
    );
}

function NavBar({ mode, pathname }: { mode: Mode; pathname: string }) {
    const { checkout } = useCart();
    return (
        <SafeAreaView edges={['top']} style={styles.bar}>
            <View style={styles.inner}>
                <View style={styles.row}>
                    <Text style={styles.brand}>Inventory & Orders</Text>
                    <View style={styles.row}>
                        <View style={styles.switch} testID="mode-switch">
                            {MODES.map((m) => (
                                <Link
                                    key={m}
                                    href={modes[m].home}
                                    accessibilityState={{ selected: m === mode }}
                                    style={[styles.switchOption, m === mode && styles.switchActive]}
                                >
                                    {modes[m].label}
                                </Link>
                            ))}
                        </View>
                        <Link href="/guide" style={[styles.link, isActive('/guide', pathname) && styles.activeLink]}>
                            Demo guide
                        </Link>
                    </View>
                </View>
                <View style={styles.links} testID="section-nav">
                    {modes[mode].sections.map(({ href, label }) => (
                        <View key={href} style={styles.linkWithBadge}>
                            <Link
                                href={href === '/cart' ? cartHref(checkout) : href}
                                style={[styles.link, isActive(href, pathname) && styles.activeLink]}
                            >
                                {label}
                            </Link>
                            {href === '/cart' && <CartBadge />}
                        </View>
                    ))}
                </View>
            </View>
        </SafeAreaView>
    );
}

export default function RootLayout() {
    const pathname = usePathname();
    const pathMode = modeForPath(pathname);
    // Shared pages (the demo guide) keep the navigation of the last mode used.
    const [lastMode, setLastMode] = useState<Mode>('admin');
    if (pathMode && pathMode !== lastMode) {
        setLastMode(pathMode);
    }
    const mode = pathMode ?? lastMode;

    return (
        <CartProvider>
            <StatusBar style="dark" />
            <Stack
                screenOptions={{
                    header: () => <NavBar mode={mode} pathname={pathname} />,
                    animation: 'none',
                    contentStyle: { backgroundColor: colors.background },
                }}
            >
                <Stack.Screen name="guide" options={{ title: 'Demo guide' }} />
                <Stack.Screen name="(customer)/shop" options={{ title: 'Shop' }} />
                <Stack.Screen name="(customer)/cart" options={{ title: 'Cart' }} />
                {/* One screen per reservation: navigating to it again reuses it instead of stacking a copy. */}
                <Stack.Screen name="(customer)/checkout/[id]" options={{ title: 'Checkout' }} dangerouslySingular />
                <Stack.Screen name="(customer)/orders/index" options={{ title: 'My orders' }} />
                <Stack.Screen name="(customer)/orders/[id]" options={{ title: 'Order' }} />
                <Stack.Screen name="admin/inventory" options={{ title: 'Inventory' }} />
                <Stack.Screen name="admin/reservations/index" options={{ title: 'Reservations' }} />
                <Stack.Screen name="admin/reservations/[id]" options={{ title: 'Reservation' }} />
                <Stack.Screen name="admin/orders/index" options={{ title: 'Orders & Fulfilment' }} />
                <Stack.Screen name="admin/orders/[id]" options={{ title: 'Order fulfilment' }} />
                <Stack.Screen name="admin/reports" options={{ title: 'Reports' }} />
            </Stack>
        </CartProvider>
    );
}

const styles = StyleSheet.create({
    bar: {
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    inner: {
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        width: '100%',
        maxWidth: 1200,
        alignSelf: 'center',
    },
    row: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    brand: { fontSize: 17, fontWeight: '700', color: colors.text },
    switch: {
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 2,
        gap: 2,
    },
    switchOption: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        fontSize: 14,
        color: colors.muted,
    },
    switchActive: { backgroundColor: colors.primary, color: colors.surface, fontWeight: '600' },
    links: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    link: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        fontSize: 14,
        color: colors.text,
    },
    activeLink: { backgroundColor: '#e3ecfb', color: colors.primary, fontWeight: '600' },
    linkWithBadge: { flexDirection: 'row', alignItems: 'center' },
    badge: {
        minWidth: 20,
        paddingHorizontal: 6,
        borderRadius: 10,
        backgroundColor: colors.primary,
        color: colors.surface,
        fontSize: 12,
        fontWeight: '700',
        textAlign: 'center',
        lineHeight: 20,
    },
});
