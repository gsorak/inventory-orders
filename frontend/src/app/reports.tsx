import { Redirect } from 'expo-router';

/** Keeps links to the pre-Administration URL working. */
export default function LegacyReports() {
    return <Redirect href="/admin/reports" />;
}
