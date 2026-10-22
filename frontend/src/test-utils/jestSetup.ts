// Screen tests press popup buttons straight away; the open guard itself is covered by the Dialog tests.
jest.mock('../components/useOpenGuard', () => ({
    ...jest.requireActual('../components/useOpenGuard'),
    useOpenGuard: (visible: boolean) => visible,
}));
