import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage, productsApi } from '../../api/client';
import type { Product, ProductTemplate } from '../../api/types';
import { Banner, type BannerMessage } from '../../components/Banner';
import { Button } from '../../components/Button';
import { ChoiceGroup } from '../../components/ChoiceGroup';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { LoadState } from '../../components/LoadState';
import { StatusBadge } from '../../components/StatusBadge';
import { TableCell, TableHeader, TableRow, type Column } from '../../components/Table';
import { common } from '../../theme';
import { formatMoney } from '../../utils/format';
import { matchesSearch, stockLevel } from '../../utils/products';
import { LIMITS, stockReceiptError, validateProduct, type FieldErrors, type ProductForm } from '../../utils/validation';

const emptyForm: ProductForm = { sku: '', name: '', unitPrice: '', lowStockThreshold: '5' };

export default function InventoryScreen() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>();
    const [message, setMessage] = useState<BannerMessage>();
    const [changedId, setChangedId] = useState<number>();
    const [search, setSearch] = useState('');

    const [creatingOpen, setCreatingOpen] = useState(false);
    const [form, setForm] = useState<ProductForm>(emptyForm);
    const [formErrors, setFormErrors] = useState<FieldErrors>({});
    const [formError, setFormError] = useState<string>();
    const [creating, setCreating] = useState(false);
    // undefined while loading; null when the backend is not the public demo, so SKU and name are free text.
    const [templates, setTemplates] = useState<ProductTemplate[] | null>();

    const [receiving, setReceiving] = useState<Product>();
    const [receiptQuantity, setReceiptQuantity] = useState('');
    const [receiptError, setReceiptError] = useState<string>();
    const [receiptFailure, setReceiptFailure] = useState<string>();
    const [receivingBusy, setReceivingBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(undefined);
        try {
            setProducts(await productsApi.list());
        } catch (e) {
            setLoadError(errorMessage(e, 'Failed to load products.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const openCreate = async () => {
        setForm(emptyForm);
        setFormErrors({});
        setFormError(undefined);
        setTemplates(undefined);
        setCreatingOpen(true);
        try {
            setTemplates(await productsApi.demoCatalog());
        } catch (e) {
            setTemplates(null);
            setFormError(errorMessage(e, 'Failed to load the demo catalogue.'));
        }
    };

    const createProduct = async () => {
        const errors = validateProduct(form);
        setFormErrors(errors);
        setFormError(undefined);
        if (Object.keys(errors).length > 0) {
            return;
        }
        setCreating(true);
        try {
            const product = await productsApi.create({
                sku: form.sku.trim(),
                name: form.name.trim(),
                unitPrice: Number(form.unitPrice.trim()),
                lowStockThreshold: Number(form.lowStockThreshold.trim()),
            });
            setCreatingOpen(false);
            setChangedId(product.id);
            setSearch('');
            setMessage({ kind: 'success', text: `Product ${product.sku} created. Receive stock to make it available.` });
            await load();
        } catch (e) {
            // Shown in the dialog, so the entered values can be corrected.
            setFormError(errorMessage(e, 'Failed to create the product.'));
        } finally {
            setCreating(false);
        }
    };

    const openReceive = (product: Product) => {
        setReceiving(product);
        setReceiptQuantity('');
        setReceiptError(undefined);
        setReceiptFailure(undefined);
    };

    const receiveStock = async () => {
        if (!receiving) {
            return;
        }
        const error = stockReceiptError(receiptQuantity);
        setReceiptError(error);
        setReceiptFailure(undefined);
        if (error) {
            return;
        }
        setReceivingBusy(true);
        try {
            const receipt = await productsApi.receiveStock(receiving.id, Number(receiptQuantity.trim()));
            setReceiving(undefined);
            setChangedId(receiving.id);
            setMessage({
                kind: 'success',
                text: `Received ${receipt.quantity} units of ${receiving.sku}. On hand is now ${receipt.stock.onHand}, available ${receipt.stock.available}.`,
            });
            await load();
        } catch (e) {
            setReceiptFailure(errorMessage(e, 'Failed to receive stock.'));
        } finally {
            setReceivingBusy(false);
        }
    };

    const updateForm = (field: keyof ProductForm, value: string) => setForm({ ...form, [field]: value });
    const chooseTemplate = (sku: string) =>
        setForm({ ...form, sku, name: templates?.find((t) => t.sku === sku)?.name ?? '' });
    const catalogueExhausted = templates?.length === 0;
    const visible = products.filter((p) => matchesSearch(p, search));
    const lowCount = products.filter((p) => stockLevel(p) !== 'IN_STOCK').length;

    return (
        <ScrollView contentContainerStyle={common.screen}>
            {message && <Banner {...message} onDismiss={() => setMessage(undefined)} />}

            <View style={common.card}>
                <View style={[common.row, { justifyContent: 'space-between' }]}>
                    <Text style={common.heading}>Inventory</Text>
                    <View style={common.row}>
                        <Button label="Refresh" variant="secondary" onPress={load} busy={loading} busyLabel="Refreshing…" />
                        <Button label="Add product" onPress={openCreate} />
                    </View>
                </View>
                <View style={[common.row, { justifyContent: 'space-between' }]}>
                    <Field label="Search products" value={search} onChangeText={setSearch} placeholder="Name or SKU" width={280} />
                    {products.length > 0 && (
                        <Text style={common.muted}>
                            {`${products.length} products · ${lowCount} at or below their low-stock threshold`}
                        </Text>
                    )}
                </View>
                <LoadState
                    loading={loading && products.length === 0}
                    error={loadError}
                    onRetry={load}
                    empty={products.length === 0 ? 'No products yet. Use Add product to create one.' : undefined}
                >
                    <TableHeader columns={Object.values(COLUMNS)} />
                    {visible.length === 0 && <Text style={common.muted}>{`No products match "${search.trim()}".`}</Text>}
                    {visible.map((p) => (
                        <TableRow key={p.id} style={p.id === changedId && common.highlight} testID={`product-${p.sku}`}>
                            <TableCell column={COLUMNS.product}>
                                <Text style={common.subheading}>{p.name}</Text>
                                <Text style={common.muted}>{`SKU ${p.sku} · #${p.id}`}</Text>
                            </TableCell>
                            <TableCell column={COLUMNS.price}>
                                <Text style={common.text}>{formatMoney(p.unitPrice)}</Text>
                            </TableCell>
                            <TableCell column={COLUMNS.onHand}>
                                <Text style={common.text} accessibilityLabel={`On hand ${p.stock.onHand}`}>
                                    {p.stock.onHand}
                                </Text>
                            </TableCell>
                            <TableCell column={COLUMNS.reserved}>
                                <Text style={common.text} accessibilityLabel={`Reserved ${p.stock.reserved}`}>
                                    {p.stock.reserved}
                                </Text>
                            </TableCell>
                            <TableCell column={COLUMNS.available}>
                                <Text style={[common.text, styles.strong]} accessibilityLabel={`Available ${p.stock.available}`}>
                                    {p.stock.available}
                                </Text>
                            </TableCell>
                            <TableCell column={COLUMNS.level}>
                                <StatusBadge status={stockLevel(p)} />
                                <Text style={common.muted}>{`Threshold ${p.lowStockThreshold}`}</Text>
                            </TableCell>
                            <TableCell column={COLUMNS.action}>
                                <Button
                                    label="Receive stock"
                                    accessibilityLabel={`Receive stock for ${p.sku}`}
                                    variant="secondary"
                                    onPress={() => openReceive(p)}
                                />
                            </TableCell>
                        </TableRow>
                    ))}
                </LoadState>
            </View>

            <Dialog
                visible={creatingOpen}
                title="Add product"
                description={
                    templates
                        ? 'This public demo offers products from a fixed list. New products start with no stock; receive stock afterwards to make them available.'
                        : 'New products start with no stock. Receive stock afterwards to make them available.'
                }
                busy={creating}
                onClose={() => setCreatingOpen(false)}
                submit={catalogueExhausted ? undefined : { label: 'Create product', busyLabel: 'Creating…', onPress: createProduct }}
            >
                {formError && <Banner kind="error" text={formError} />}
                {templates === undefined && <Text style={common.muted}>Loading…</Text>}
                {catalogueExhausted && (
                    <Text style={common.muted}>
                        Every product of the demo catalogue has been added. More become available when the demo data is reset.
                    </Text>
                )}
                {templates && templates.length > 0 && (
                    <ChoiceGroup
                        label="Product"
                        accessibilityLabel="Demo product"
                        options={templates.map((t) => t.sku)}
                        value={form.sku}
                        onChange={chooseTemplate}
                        formatOption={(sku) => `${templates.find((t) => t.sku === sku)?.name} (${sku})`}
                        error={formErrors.sku && 'Choose a product'}
                    />
                )}
                {templates === null && (
                    <View style={common.row}>
                        <Field
                            label="SKU"
                            value={form.sku}
                            onChangeText={(v) => updateForm('sku', v)}
                            error={formErrors.sku}
                            maxLength={LIMITS.skuLength}
                            width={180}
                        />
                        <Field
                            label="Name"
                            value={form.name}
                            onChangeText={(v) => updateForm('name', v)}
                            error={formErrors.name}
                            maxLength={LIMITS.nameLength}
                            width={260}
                        />
                    </View>
                )}
                {templates !== undefined && !catalogueExhausted && (
                    <View style={common.row}>
                        <Field
                            label="Unit price"
                            value={form.unitPrice}
                            onChangeText={(v) => updateForm('unitPrice', v)}
                            error={formErrors.unitPrice}
                            placeholder="e.g. 19.99"
                            format="amount"
                            width={140}
                        />
                        <Field
                            label="Low-stock threshold"
                            value={form.lowStockThreshold}
                            onChangeText={(v) => updateForm('lowStockThreshold', v)}
                            error={formErrors.lowStockThreshold}
                            format="integer"
                            width={160}
                        />
                    </View>
                )}
            </Dialog>

            <Dialog
                visible={receiving !== undefined}
                title={`Receive stock for ${receiving?.sku ?? ''}`}
                description={
                    receiving
                        ? `${receiving.name}: on hand ${receiving.stock.onHand}, available ${receiving.stock.available}. Received units are added to on-hand and available stock.`
                        : undefined
                }
                busy={receivingBusy}
                onClose={() => setReceiving(undefined)}
                submit={{ label: 'Receive', busyLabel: 'Receiving…', onPress: receiveStock }}
            >
                {receiptFailure && <Banner kind="error" text={receiptFailure} />}
                <Field
                    label="Quantity received"
                    value={receiptQuantity}
                    onChangeText={setReceiptQuantity}
                    error={receiptError}
                    format="integer"
                    width={160}
                />
            </Dialog>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    strong: { fontWeight: '600' },
});

const COLUMNS = {
    product: { label: 'Product', wide: true },
    price: { label: 'Price', numeric: true },
    onHand: { label: 'On hand', numeric: true },
    reserved: { label: 'Reserved', numeric: true },
    available: { label: 'Available', numeric: true },
    level: { label: 'Stock level', wide: true },
    action: { label: '' },
} satisfies Record<string, Column>;
