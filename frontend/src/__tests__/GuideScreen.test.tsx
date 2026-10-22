import { render, screen } from '@testing-library/react-native';

import GuideScreen from '../app/guide';

jest.mock('expo-router', () => require('../test-utils/expoRouterMock'));

describe('Demo guide screen', () => {
    it('explains the customer and administration workflows', async () => {
        await render(<GuideScreen />);

        expect(screen.getByText('Demo guide')).toBeTruthy();
        expect(screen.getByText('Customer workflow')).toBeTruthy();
        expect(screen.getByText('Administration workflow')).toBeTruthy();
        for (const step of ['Browse the shop', 'Check out', 'Confirm payment', 'Follow the order']) {
            expect(screen.getByText(step)).toBeTruthy();
        }
        for (const step of ['Manage inventory', 'Monitor reservations', 'Fulfil orders', 'Record returns', 'Check the reports']) {
            expect(screen.getByText(step)).toBeTruthy();
        }
        expect(screen.getByText(/^Administration → Inventory/)).toBeTruthy();
        expect(screen.getByText(/^Customer → Orders/)).toBeTruthy();
    });
});
