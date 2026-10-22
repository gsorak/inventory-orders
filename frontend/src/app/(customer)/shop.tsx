import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { errorMessage, productsApi } from '../../api/client';
import type { Product } from '../../api/types';
import { Banner, type BannerMessage } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { LoadState } from '../../components/LoadState';
import { cartQuantity } from '../../cart/cart';
import { useCart } from '../../cart/CartContext';
import { cartHref } from '../../cart/checkout';
import { colors, common } from '../../theme';
import { formatMoney } from '../../utils/format';
import { matchesSearch } from '../../utils/products';
import { LIMITS, wholeNumberError } from '../../utils/validation';

const GRID_GAP = 12;
/** Narrowest card that still fits the quantity field and the Add to cart button side by side. */
const MIN_CARD_WIDTH = 240;

/** Equal card width for as many columns as fit, so a short last row keeps the same card size. */
function cardWidth(gridWidth: number): number | undefined {
    if (gridWidth <= 0) {
        return undefined;
    }
    const columns = Math.max(1, Math.floor((gridWidth + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP)));
    return Math.floor((gridWidth - GRID_GAP * (columns - 1)) / columns);
}

/** Units of `product` that can still be added, given what is already in the cart (provisional; checkout decides). */
function addableQuantity(product: Product, inCart: number): number {
    return Math.max(0, product.stock.available - inCart);
}

export default function ShopScreen() {
    const { cart, checkout, add, refresh } = useCart();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>();
    const [message, setMessage] = useState<BannerMessage>();
    const [search, setSearch] = useState('');
    const [quantities, setQuantities] = useState<Record<number, string>>({});
    const [errors, setErrors] = useState<Record<number, string | undefined>>({});
    const [gridWidth, setGridWidth] = useState(0);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(undefined);
        try {
            const list = await productsApi.list();
            setProducts(list);
            refresh(list);
        } catch (e) {
            setLoadError(errorMessage(e, 'Failed to load products.'));
        } finally {
            setLoading(false);
        }
    }, [refresh]);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const addProduct = (product: Product) => {
        const text = quantities[product.id] ?? '1';
        const remaining = addableQuantity(product, cartQuantity(cart, product.id));
        let error = wholeNumberError(text, 1, LIMITS.reservationQuantity);
        if (!error && Number(text.trim()) > remaining) {
            error = remaining === 0 ? 'All available units are already in your cart' : `Only ${remaining} more available`;
        }
        setErrors({ ...errors, [product.id]: error });
        if (error) {
            return;
        }
        const quantity = Number(text.trim());
        add(product, quantity);
        setQuantities({ ...quantities, [product.id]: '1' });
        setMessage({ kind: 'success', text: `Added ${quantity} × ${product.name} to your cart.` });
    };

    const visible = products.filter((p) => matchesSearch(p, search));
    const width = cardWidth(gridWidth);

    return (
        <View style={styles.page}>
            <ScrollView contentContainerStyle={[common.screen, message && styles.toastSpace]}>
                {checkout && (
                    <View style={[common.card, styles.locked]} testID="shop-locked">
                        <Text style={common.text}>
                            Your cart is locked while your checkout is in progress. Confirm the payment or cancel the checkout
                            to add products.
                        </Text>
                        <Link href={cartHref(checkout)} style={styles.cartLink}>
                            Continue checkout →
                        </Link>
                    </View>
                )}

                <View style={common.card}>
                    <View style={[common.row, { justifyContent: 'space-between' }]}>
                        <Text style={common.heading}>Shop</Text>
                        <Link href={cartHref(checkout)} style={styles.cartLink}>
                            {cart.length === 0 ? 'Your cart is empty' : `View cart (${cart.length} ${cart.length === 1 ? 'product' : 'products'}) →`}
                        </Link>
                    </View>
                    <Field label="Search products" value={search} onChangeText={setSearch} placeholder="Name or SKU" width={280} />
                    <LoadState
                        loading={loading && products.length === 0}
                        error={loadError}
                        onRetry={load}
                        empty={products.length === 0 ? 'No products are available yet.' : undefined}
                    >
                        {visible.length === 0 && <Text style={common.muted}>{`No products match "${search.trim()}".`}</Text>}
                        <View
                            style={styles.grid}
                            testID="shop-grid"
                            onLayout={(e: LayoutChangeEvent) => setGridWidth(e.nativeEvent.layout.width)}
                        >
                            {visible.map((p) => {
                                const inCart = cartQuantity(cart, p.id);
                                const soldOut = p.stock.available === 0;
                                return (
                                    <View
                                        key={p.id}
                                        style={[styles.product, width !== undefined && { width }, soldOut && styles.soldOut]}
                                        testID={`shop-product-${p.sku}`}
                                    >
                                        <Text style={[common.subheading, styles.name]} numberOfLines={2}>
                                            {p.name}
                                        </Text>
                                        <Text style={common.muted} numberOfLines={1}>{`SKU ${p.sku}`}</Text>
                                        <View style={styles.priceRow}>
                                            <Text style={styles.price}>{formatMoney(p.unitPrice)}</Text>
                                            <Text
                                                style={[styles.stock, soldOut ? styles.stockOut : styles.stockIn]}
                                                accessibilityLabel={soldOut ? 'Out of stock' : `${p.stock.available} available`}
                                            >
                                                {soldOut ? 'Out of stock' : `${p.stock.available} available`}
                                            </Text>
                                        </View>
                                        <Text style={[common.muted, styles.line]}>{inCart > 0 ? `${inCart} in your cart` : ''}</Text>
                                        {!soldOut && !checkout && (
                                            <View style={styles.footer}>
                                                <View style={styles.controls}>
                                                    <Field
                                                        label="Quantity"
                                                        accessibilityLabel={`Quantity of ${p.sku}`}
                                                        value={quantities[p.id] ?? '1'}
                                                        onChangeText={(v) => setQuantities({ ...quantities, [p.id]: v })}
                                                        error={errors[p.id]}
                                                        showErrorText={false}
                                                        format="integer"
                                                        width={90}
                                                    />
                                                    <Button
                                                        label="Add to cart"
                                                        accessibilityLabel={`Add ${p.sku} to cart`}
                                                        onPress={() => addProduct(p)}
                                                    />
                                                </View>
                                                <Text style={[styles.error, styles.line]}>{errors[p.id] ?? ''}</Text>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    </LoadState>
                </View>
            </ScrollView>
            {/* Floats over the catalog so showing or dismissing it never moves the products. */}
            {message && (
                <View style={styles.toast}>
                    <View style={styles.toastBody}>
                        <Banner {...message} onDismiss={() => setMessage(undefined)} />
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    cartLink: { color: colors.primary, fontWeight: '600' },
    locked: { backgroundColor: '#eef3fb' },
    page: { flex: 1 },
    toast: { position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center', paddingHorizontal: 16, pointerEvents: 'box-none' },
    toastBody: { width: '100%', maxWidth: 560, borderRadius: 6, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' },
    // Lets the last row scroll clear of the notification; it only adds space below the catalog.
    toastSpace: { paddingBottom: 96 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
    product: {
        width: '100%',
        gap: 6,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: colors.surface,
    },
    soldOut: { backgroundColor: colors.background },
    name: { lineHeight: 20, minHeight: 40 },
    priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    line: { lineHeight: 16, minHeight: 16 },
    footer: { marginTop: 'auto', gap: 4 },
    controls: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    error: { fontSize: 12, color: colors.danger },
    price: { fontSize: 16, fontWeight: '700', color: colors.text },
    stock: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    stockIn: { backgroundColor: '#e8f5e9', color: colors.success },
    stockOut: { backgroundColor: '#fdecea', color: colors.danger },
});
