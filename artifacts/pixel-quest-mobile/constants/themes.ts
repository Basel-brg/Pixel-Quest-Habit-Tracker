import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const THEME_IDS = ['retro', 'anime', 'cyberpunk', 'parchment', 'brutalist', 'cozy'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const isThemeId = (v: unknown): v is ThemeId => typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string;
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }) as string;
const DM = { DMSans_400Regular: 'DMSans_400Regular', DMSans_500Medium: 'DMSans_500Medium', DMSans_600SemiBold: 'DMSans_600SemiBold', DMSans_700Bold: 'DMSans_700Bold' };
const all = (f: string) => ({ DMSans_400Regular: f, DMSans_500Medium: f, DMSans_600SemiBold: f, DMSans_700Bold: f });

export interface ThemeColors {
  text: string; tint: string; background: string; foreground: string; card: string; cardForeground: string;
  primary: string; primaryForeground: string; secondary: string; secondaryForeground: string; muted: string; mutedForeground: string;
  accent: string; accentForeground: string; destructive: string; destructiveForeground: string; border: string; input: string;
  gold: string; cyan: string; purple: string; success: string; sidebar: string;
}
export interface ThemeTokens {
  id: ThemeId; name: string; blurb: string; dark: boolean; colors: ThemeColors;
  radius: { sm: number; md: number; lg: number; pill: boolean };
  border: { panel: number; control: number };
  /** Native shadow (hard offsets on iOS/web; Android falls back to elevation). */
  shadow: ViewStyle;
  /** 3D bottom edge thickness for buttons. */
  buttonEdge: number;
  fontMap: Record<string, string>;
  title: TextStyle; section: TextStyle; eyebrow: TextStyle; button: TextStyle; numeric: TextStyle;
}

function colors(p: { bg: string; panel: string; panel2: string; line: string; ink: string; mute: string; a: string; aFg: string; b: string; bFg: string; purple: string; danger: string; success: string; side: string }): ThemeColors {
  return { text: p.ink, tint: p.a, background: p.bg, foreground: p.ink, card: p.panel, cardForeground: p.ink, primary: p.a, primaryForeground: p.aFg, secondary: p.panel2, secondaryForeground: p.ink, muted: p.panel2, mutedForeground: p.mute, accent: p.b, accentForeground: p.bFg, destructive: p.danger, destructiveForeground: '#ffffff', border: p.line, input: p.line, gold: p.a, cyan: p.b, purple: p.purple, success: p.success, sidebar: p.side };
}
const hard = (c: string, x: number, y: number): ViewStyle => ({ shadowColor: c, shadowOffset: { width: x, height: y }, shadowOpacity: 1, shadowRadius: 0, elevation: 0 });

export const THEMES: Record<ThemeId, ThemeTokens> = {
  retro: { id: 'retro', name: '8-Bit Retro', blurb: 'Chunky pixels, purple slate.', dark: true,
    colors: colors({ bg: '#161727', panel: '#202038', panel2: '#302c44', line: '#464253', ink: '#f2ead8', mute: '#a8a4b6', a: '#f8d061', aFg: '#161727', b: '#73e5e6', bFg: '#161727', purple: '#b497f7', danger: '#e95b4e', success: '#91d78b', side: '#12121f' }),
    radius: { sm: 5, md: 6, lg: 8, pill: false }, border: { panel: 2, control: 1 }, shadow: hard('#0b0a14', 3, 3), buttonEdge: 3, fontMap: { ...DM },
    title: { fontFamily: 'PressStart2P_400Regular', fontSize: 18, lineHeight: 29 }, section: { fontFamily: 'PressStart2P_400Regular', fontSize: 11, lineHeight: 20 },
    eyebrow: { fontFamily: 'DMSans_700Bold', letterSpacing: 1.4, textTransform: 'uppercase' }, button: { fontFamily: 'DMSans_700Bold' }, numeric: { fontFamily: 'PressStart2P_400Regular' } },
  anime: { id: 'anime', name: 'System UI', blurb: 'Midnight glass, cyan glow.', dark: true,
    colors: colors({ bg: '#070d22', panel: '#101c40', panel2: '#16264f', line: '#1d7f99', ink: '#e6f6ff', mute: '#8aa2c8', a: '#00f0ff', aFg: '#04121f', b: '#b78cff', bFg: '#0a0620', purple: '#8b6cff', danger: '#ff7a9c', success: '#5df0b0', side: '#050a1a' }),
    radius: { sm: 10, md: 14, lg: 18, pill: false }, border: { panel: 1, control: 1 }, shadow: { shadowColor: '#00f0ff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.28, shadowRadius: 14, elevation: 4 }, buttonEdge: 0,
    fontMap: { ...DM, DMSans_400Regular: 'DMSans_400Regular' },
    title: { fontFamily: 'DMSans_700Bold', fontSize: 22, lineHeight: 28, letterSpacing: 2, textTransform: 'uppercase' }, section: { fontFamily: 'DMSans_700Bold', fontSize: 14, lineHeight: 20, letterSpacing: 1.6, textTransform: 'uppercase' },
    eyebrow: { fontFamily: 'DMSans_600SemiBold', letterSpacing: 2.2, textTransform: 'uppercase' }, button: { fontFamily: 'DMSans_700Bold', letterSpacing: 0.8 }, numeric: { fontFamily: 'DMSans_700Bold' } },
  cyberpunk: { id: 'cyberpunk', name: 'Cyber Terminal', blurb: 'Hot pink, scanlines, mono.', dark: true,
    colors: colors({ bg: '#0a0a0f', panel: '#12121a', panel2: '#1b1220', line: '#8a1346', ink: '#e8ffd8', mute: '#82a077', a: '#ff0055', aFg: '#0a0a0f', b: '#d7ff1f', bFg: '#0a0a0f', purple: '#ff5fa8', danger: '#ff9a3d', success: '#d7ff1f', side: '#050508' }),
    radius: { sm: 0, md: 0, lg: 0, pill: false }, border: { panel: 1, control: 1 }, shadow: { shadowColor: '#ff0055', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 3 }, buttonEdge: 0, fontMap: all(MONO),
    title: { fontFamily: MONO, fontSize: 20, lineHeight: 26, letterSpacing: 1, textTransform: 'uppercase' }, section: { fontFamily: MONO, fontSize: 13, lineHeight: 20, letterSpacing: 1, textTransform: 'uppercase' },
    eyebrow: { fontFamily: MONO, letterSpacing: 2, textTransform: 'uppercase' }, button: { fontFamily: MONO, textTransform: 'uppercase', letterSpacing: 1 }, numeric: { fontFamily: MONO } },
  parchment: { id: 'parchment', name: 'Parchment', blurb: 'Leather, crimson, old maps.', dark: false,
    colors: colors({ bg: '#f5eedc', panel: '#ecdfbf', panel2: '#e1d2aa', line: '#8a6a43', ink: '#3b2a1a', mute: '#6f5a3d', a: '#9c1f2e', aFg: '#fbf3de', b: '#7a4a1e', bFg: '#fbf3de', purple: '#6d3b5c', danger: '#b3261e', success: '#3f6b2f', side: '#e8dec4' }),
    radius: { sm: 3, md: 5, lg: 8, pill: false }, border: { panel: 2, control: 1.5 }, shadow: { shadowColor: '#5a3c19', shadowOffset: { width: 1, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3 }, buttonEdge: 0, fontMap: all(SERIF),
    title: { fontFamily: SERIF, fontWeight: '700', fontSize: 22, lineHeight: 28, letterSpacing: 0.3 }, section: { fontFamily: SERIF, fontWeight: '700', fontSize: 16, lineHeight: 22 },
    eyebrow: { fontFamily: SERIF, fontStyle: 'italic', letterSpacing: 0.8, textTransform: 'none' }, button: { fontFamily: SERIF, fontWeight: '700' }, numeric: { fontFamily: SERIF, fontWeight: '700' } },
  brutalist: { id: 'brutalist', name: 'Brutalist Arcade', blurb: 'Yellow, black, hard shadows.', dark: false,
    colors: colors({ bg: '#fff1b0', panel: '#fffaf0', panel2: '#ffe98a', line: '#111111', ink: '#111111', mute: '#444444', a: '#ff5a1f', aFg: '#111111', b: '#0a63e8', bFg: '#ffffff', purple: '#7a2ff0', danger: '#d90429', success: '#0b7a3b', side: '#ffe56b' }),
    radius: { sm: 0, md: 0, lg: 0, pill: false }, border: { panel: 4, control: 3 }, shadow: hard('#111111', 5, 5), buttonEdge: 0, fontMap: { ...DM },
    title: { fontFamily: 'DMSans_700Bold', fontWeight: '900', fontSize: 24, lineHeight: 28, textTransform: 'uppercase', letterSpacing: -0.5 }, section: { fontFamily: 'DMSans_700Bold', fontWeight: '900', fontSize: 15, lineHeight: 20, textTransform: 'uppercase' },
    eyebrow: { fontFamily: 'DMSans_700Bold', fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }, button: { fontFamily: 'DMSans_700Bold', fontWeight: '900', textTransform: 'uppercase' }, numeric: { fontFamily: 'DMSans_700Bold', fontWeight: '900' } },
  cozy: { id: 'cozy', name: 'Cozy Arcade', blurb: 'Mint, peach, lilac pills.', dark: false,
    colors: colors({ bg: '#e6f8ee', panel: '#fff7ef', panel2: '#f1eaff', line: '#bfe3d0', ink: '#3a3350', mute: '#6f6889', a: '#e8643a', aFg: '#ffffff', b: '#1f8a6a', bFg: '#ffffff', purple: '#8c68e0', danger: '#d94463', success: '#1f8a6a', side: '#d4f0e1' }),
    radius: { sm: 12, md: 16, lg: 24, pill: true }, border: { panel: 2, control: 2 }, shadow: { shadowColor: '#cdbff0', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 1, shadowRadius: 0, elevation: 2 }, buttonEdge: 4, fontMap: { ...DM },
    title: { fontFamily: 'DMSans_700Bold', fontSize: 24, lineHeight: 30 }, section: { fontFamily: 'DMSans_700Bold', fontSize: 16, lineHeight: 22 },
    eyebrow: { fontFamily: 'DMSans_700Bold', letterSpacing: 0.6, textTransform: 'none' }, button: { fontFamily: 'DMSans_700Bold', fontSize: 14 }, numeric: { fontFamily: 'DMSans_700Bold' } },
};
