import { StyleSheet } from 'react-native';

export const colors = {
  primary: '#1f6feb',
  danger: '#c62828',
  success: '#2e7d32',
  warning: '#b26a00',
  text: '#1a1a1a',
  muted: '#5f6368',
  placeholder: '#9aa0a6',
  border: '#d8dde3',
  background: '#f5f7fa',
  surface: '#ffffff',
  highlight: '#fff4c2',
};

/** Layout styles shared by all screens. */
export const common = StyleSheet.create({
  screen: {
    flexGrow: 1,
    padding: 16,
    gap: 16,
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  subheading: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
  },
  text: {
    color: colors.text,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  tableRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tableHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  cell: {
    flex: 1,
    minWidth: 70,
    fontSize: 14,
    color: colors.text,
  },
  wideCell: {
    flex: 2,
    minWidth: 140,
    fontSize: 14,
    color: colors.text,
  },
  highlight: {
    backgroundColor: colors.highlight,
  },
});
