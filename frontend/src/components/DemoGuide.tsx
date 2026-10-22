import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, common } from '../theme';

type StepHref = '/admin/inventory' | '/shop' | '/cart' | '/admin/reservations' | '/admin/orders' | '/admin/reports' | '/orders';

interface Step {
    title: string;
    text: string;
    where: string;
    href: StepHref;
}

const customerSteps: Step[] = [
    {
        title: 'Browse the shop',
        text: 'Search products and add them to the cart. The cart is kept in this browser and reserves nothing.',
        where: 'Customer → Shop',
        href: '/shop',
    },
    {
        title: 'Check out',
        text: 'Checking out reserves every cart line at once for 15 minutes; if any product is short, nothing is reserved.',
        where: 'Customer → Cart',
        href: '/cart',
    },
    {
        title: 'Confirm payment',
        text: 'Payment is simulated. Confirming turns the reservation into an order; cancelling or letting it expire releases the stock.',
        where: 'Customer → Checkout',
        href: '/cart',
    },
    {
        title: 'Follow the order',
        text: 'Status, shipments, returns and credit notes, read-only.',
        where: 'Customer → Orders',
        href: '/orders',
    },
];

const adminSteps: Step[] = [
    {
        title: 'Manage inventory',
        text: 'Add products and receive stock; on-hand, reserved and available units are shown per product.',
        where: 'Administration → Inventory',
        href: '/admin/inventory',
    },
    {
        title: 'Monitor reservations',
        text: 'Inspect reserved products, expiry and stock release; cancel active reservations.',
        where: 'Administration → Reservations',
        href: '/admin/reservations',
    },
    {
        title: 'Fulfil orders',
        text: 'Pack full or partial shipments, then ship and deliver them. Shipping removes the units from on-hand and reserved stock.',
        where: 'Administration → Orders & Fulfilment',
        href: '/admin/orders',
    },
    {
        title: 'Record returns',
        text: 'Return delivered units from the order details: a credit note is issued; unopened units are restocked, others discarded.',
        where: 'Administration → Orders & Fulfilment',
        href: '/admin/orders',
    },
    {
        title: 'Check the reports',
        text: 'Low stock, inventory aging and order cycle time.',
        where: 'Administration → Reports',
        href: '/admin/reports',
    },
];

function StepList({ title, steps }: { title: string; steps: Step[] }) {
    return (
        <View style={common.card}>
            <Text style={common.heading}>{title}</Text>
            <View style={styles.steps}>
                {steps.map((step, index) => (
                    <View key={step.title} style={styles.step}>
                        <Text style={styles.number}>{index + 1}</Text>
                        <View style={styles.body}>
                            <Link href={step.href} style={styles.title}>
                                {step.title}
                            </Link>
                            <Text style={common.muted}>{`${step.where} · ${step.text}`}</Text>
                        </View>
                    </View>
                ))}
            </View>
        </View>
    );
}

/** Overview of the Customer and Administration workflows and how they connect. */
export function DemoGuide() {
    return (
        <>
            <View style={common.card}>
                <Text style={common.heading}>Demo guide</Text>
                <Text style={common.text}>
                    A suggested run: create a product and receive stock as an administrator, buy it as a customer, then pack,
                    ship, deliver and return part of the order as an administrator, and finish with the reports. The
                    customer order page follows every step.
                </Text>
                <Text style={common.muted}>
                    Use the Customer / Administration switch at the top to change views. The switch is for demonstration only;
                    there is no sign-in and every page is reachable directly.
                </Text>
            </View>
            <StepList title="Customer workflow" steps={customerSteps} />
            <StepList title="Administration workflow" steps={adminSteps} />
        </>
    );
}

const styles = StyleSheet.create({
    steps: { gap: 8 },
    step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    number: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#e3ecfb',
        color: colors.primary,
        textAlign: 'center',
        lineHeight: 22,
        fontSize: 12,
        fontWeight: '700',
    },
    body: { flex: 1, gap: 2 },
    title: { fontSize: 14, fontWeight: '600', color: colors.primary },
});
