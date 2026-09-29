import { DarkTheme } from '@react-navigation/native';

// Dark navy surfaces with a pickleball-yellow-green accent.
export const colors = {
  bg: '#0B1220',
  card: '#141C2F',
  card2: '#1E293B',
  border: '#26324A',
  text: '#F8FAFC',
  muted: '#94A3B8',
  accent: '#B6F03B',      // primary actions, active tabs
  onAccent: '#0B1220',    // text/icons on top of the accent
  info: '#60A5FA',
  ok: '#22C55E',
  warn: '#F59E0B',
  danger: '#EF4444',
  club: '#60A5FA',
  event: '#34D399',
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

export const stackOptions = {
  headerStyle: { backgroundColor: colors.card },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '700' },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
};

export const tabBarOptions = {
  headerStyle: { backgroundColor: colors.card },
  headerTintColor: colors.text,
  headerShadowVisible: false,
  tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
  tabBarActiveTintColor: colors.accent,
  tabBarInactiveTintColor: colors.muted,
  tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
};
