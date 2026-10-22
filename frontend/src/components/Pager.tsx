import { StyleSheet, Text, View } from 'react-native';

import type { Page } from '../api/types';
import { colors } from '../theme';
import { Button } from './Button';

interface PagerProps {
    page: Page<unknown>;
    onChange: (page: number) => void;
    noun: string;
}

export function Pager({ page, onChange, noun }: PagerProps) {
    if (page.totalPages <= 1) {
        return <Text style={styles.text}>{`${page.totalElements} ${noun}`}</Text>;
    }
    return (
        <View style={styles.pager}>
            <Button label="Previous" variant="secondary" disabled={page.page === 0} onPress={() => onChange(page.page - 1)} />
            <Text style={styles.text}>{`Page ${page.page + 1} of ${page.totalPages} · ${page.totalElements} ${noun}`}</Text>
            <Button
                label="Next"
                variant="secondary"
                disabled={page.page + 1 >= page.totalPages}
                onPress={() => onChange(page.page + 1)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    pager: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    text: { color: colors.muted, fontSize: 13 },
});
