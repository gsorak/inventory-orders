import { render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import { COMPACT_TABLE_WIDTH, TableCell, TableHeader, TableRow, type Column } from '../components/Table';

let mockWidth = 0;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
    __esModule: true,
    default: () => ({ width: mockWidth, height: 800, scale: 1, fontScale: 1 }),
}));

const COLUMNS = {
    product: { label: 'Product', wide: true },
    onHand: { label: 'On hand', numeric: true },
    action: { label: '' },
} satisfies Record<string, Column>;

async function renderTable(width: number) {
    mockWidth = width;
    await render(
        <>
            <TableHeader columns={Object.values(COLUMNS)} />
            <TableRow testID="row">
                <TableCell column={COLUMNS.product}>
                    <Text>Widget</Text>
                </TableCell>
                <TableCell column={COLUMNS.onHand}>
                    <Text>5</Text>
                </TableCell>
                <TableCell column={COLUMNS.action}>
                    <Text>Receive</Text>
                </TableCell>
            </TableRow>
        </>
    );
}

describe('Table', () => {
    it('shows one header row and unlabelled cells on wide screens', async () => {
        await renderTable(COMPACT_TABLE_WIDTH);

        const row = within(screen.getByTestId('row'));
        expect(screen.getByText('Product')).toBeTruthy();
        expect(screen.getByText('On hand')).toBeTruthy();
        expect(row.queryByText('Product')).toBeNull();
        expect(row.queryByText('On hand')).toBeNull();
        expect(row.getByText('Widget')).toBeTruthy();
        expect(row.getByText('Receive')).toBeTruthy();
    });

    it('drops the header row and labels every value in cards on narrow screens', async () => {
        await renderTable(390);

        const row = within(screen.getByTestId('row'));
        expect(screen.getAllByText('Product')).toHaveLength(1);
        expect(row.getByText('Product')).toBeTruthy();
        expect(row.getByText('On hand')).toBeTruthy();
        expect(screen.getByTestId('row')).toHaveStyle({ borderWidth: 1, borderRadius: 8 });
        expect(row.getByText('Widget')).toBeTruthy();
        expect(row.getByText('5')).toBeTruthy();
        expect(row.getByText('Receive')).toBeTruthy();
    });
});
