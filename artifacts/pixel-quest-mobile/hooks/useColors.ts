import { useTheme } from '@/lib/theme';

/** Account theme colors (never the device appearance), plus legacy `radius`. */
export function useColors() {
  const { tokens } = useTheme();
  return { ...tokens.colors, radius: tokens.radius.md };
}
