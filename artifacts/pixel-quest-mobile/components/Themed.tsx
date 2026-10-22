import React from 'react';
import { Pressable as RNPressable, StyleSheet, Text as RNText, View as RNView, type PressableProps, type TextProps, type ViewProps } from 'react-native';
import { useTheme } from '@/lib/theme';
import type { ThemeTokens } from '@/constants/themes';

/** Re-maps hard-coded font families, radii and border widths in any style to the active theme's structural tokens. */
function remap(style: unknown, t: ThemeTokens) {
  const f = StyleSheet.flatten(style as never) as Record<string, unknown> | undefined;
  if (!f) return style;
  let out: Record<string, unknown> | null = null;
  const set = (k: string, v: unknown) => { out = out ?? { ...f }; out[k] = v; };
  const ff = f.fontFamily as string | undefined;
  if (ff) {
    if (ff === 'PressStart2P_400Regular') { if (t.numeric.fontFamily !== ff) { set('fontFamily', t.numeric.fontFamily); if (t.numeric.fontWeight) set('fontWeight', t.numeric.fontWeight); const fs = f.fontSize as number | undefined; if (fs) { set('fontSize', Math.round(fs * 1.35)); if (f.lineHeight) set('lineHeight', Math.round((f.lineHeight as number) * 1.3)); } } }
    else if (t.fontMap[ff] && t.fontMap[ff] !== ff) { set('fontFamily', t.fontMap[ff]); if (ff === 'DMSans_700Bold' && t.id !== 'cyberpunk') set('fontWeight', 'bold'); }
  }
  const br = f.borderRadius as number | undefined;
  if (typeof br === 'number' && br > 0) set('borderRadius', br >= 999 ? 999 : br <= 6 ? t.radius.sm : br <= 10 ? t.radius.md : t.radius.lg);
  const bw = f.borderWidth as number | undefined;
  if (typeof bw === 'number' && bw > 0) set('borderWidth', bw >= 2 ? t.border.panel : t.border.control);
  return out ?? style;
}
export const Text = React.forwardRef<RNText, TextProps>(function ThemedText({ style, ...p }, ref) { const { tokens } = useTheme(); return <RNText ref={ref} {...p} style={remap(style, tokens) as TextProps['style']} />; });
export const View = React.forwardRef<RNView, ViewProps>(function ThemedView({ style, ...p }, ref) { const { tokens } = useTheme(); return <RNView ref={ref} {...p} style={remap(style, tokens) as ViewProps['style']} />; });
export const Pressable = React.forwardRef<RNView, PressableProps>(function ThemedPressable({ style, ...p }, ref) {
  const { tokens } = useTheme();
  return <RNPressable ref={ref} {...p} style={typeof style === 'function' ? (s) => remap(style(s), tokens) as never : remap(style, tokens) as never} />;
});
