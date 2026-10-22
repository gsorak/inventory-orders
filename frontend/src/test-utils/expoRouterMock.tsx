/**
 * Test double for expo-router, used via
 * `jest.mock('expo-router', () => require('../test-utils/expoRouterMock'))`.
 * Focus effects run on mount; links render as text.
 */
import React from 'react';
import { Text } from 'react-native';

export const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

let params: Record<string, string> = {};

export function setMockParams(next: Record<string, string>) {
    params = next;
}

export function useRouter() {
    return mockRouter;
}

export function useLocalSearchParams() {
    return params;
}

export function usePathname() {
    return '/';
}

export function useFocusEffect(effect: () => void) {
    React.useEffect(() => effect(), [effect]);
}

export function Link({ children }: { children: React.ReactNode }) {
    return <Text>{children}</Text>;
}
