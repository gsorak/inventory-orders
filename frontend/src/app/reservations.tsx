import { Redirect } from 'expo-router';

/** Keeps links to the pre-Administration URL working. */
export default function LegacyReservations() {
    return <Redirect href="/admin/reservations" />;
}
