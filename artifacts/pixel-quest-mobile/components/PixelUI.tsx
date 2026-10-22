import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';

type ButtonTone = 'primary' | 'quiet' | 'danger' | 'cyan';

export function PixelPage({
  children,
  keyboard = false,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  keyboard?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const contentStyle = [
    styles.pageContent,
    {
      paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 18),
      paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16) + 112,
    },
  ];

  if (keyboard) {
    return (
      <KeyboardAwareScrollViewCompat
        style={[styles.page, { backgroundColor: colors.background }]}
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={24}
      >
        {children}
      </KeyboardAwareScrollViewCompat>
    );
  }

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: colors.background }]}
      contentContainerStyle={contentStyle}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={colors.cyan}
            colors={[colors.cyan]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function ScreenTitle({
  eyebrow,
  title,
  subtitle,
  trailing,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.screenTitle}>
      <View style={styles.titleCopy}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: colors.cyan }]}>{eyebrow}</Text>
        ) : null}
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

export function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        {title}
      </Text>
      {action}
    </View>
  );
}

export function PixelButton({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  compact = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  compact?: boolean;
  testID: string;
}) {
  const colors = useColors();
  const palette = {
    primary: { backgroundColor: colors.primary, color: colors.primaryForeground },
    quiet: { backgroundColor: colors.secondary, color: colors.foreground },
    danger: { backgroundColor: colors.destructive, color: colors.destructiveForeground },
    cyan: { backgroundColor: colors.cyan, color: colors.accentForeground },
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: palette.backgroundColor, opacity: disabled ? 0.48 : pressed ? 0.78 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: palette.color }]}>{label}</Text>
    </Pressable>
  );
}

export function ChoiceChip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={testID}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? colors.cyan : colors.border,
          backgroundColor: selected ? colors.muted : 'transparent',
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: selected ? colors.cyan : colors.mutedForeground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  const colors = useColors();
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.sidebar,
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function LoadingState({ label = 'Loading your quest...' }: { label?: string }) {
  const colors = useColors();
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.cyan} />
      <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  const colors = useColors();
  return (
    <Panel>
      <Text style={[styles.errorText, { color: colors.destructive }]}>
        {message}
      </Text>
      <PixelButton label="Try again" onPress={retry} tone="quiet" testID="button-retry" />
    </Panel>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  const colors = useColors();
  return (
    <View style={[styles.empty, { borderColor: colors.border }]}>
      <View style={[styles.emptyMark, { backgroundColor: colors.muted }]}>
        <View style={[styles.emptyPixel, { backgroundColor: colors.cyan }]} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
        {detail}
      </Text>
    </View>
  );
}

export function PixelBar({ progress }: { progress: number }) {
  const colors = useColors();
  const bounded = Math.max(0, Math.min(100, progress));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: bounded }}
      style={[styles.bar, { borderColor: colors.border, backgroundColor: colors.sidebar }]}
    >
      <View style={[styles.barFill, { backgroundColor: colors.cyan, width: `${bounded}%` }]} />
    </View>
  );
}

export function MetaText({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.meta, { color: colors.mutedForeground }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageContent: { paddingHorizontal: 18, gap: 14 },
  panel: { borderWidth: 2, borderRadius: 8, padding: 16, gap: 12 },
  screenTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 },
  titleCopy: { flex: 1, gap: 7 },
  eyebrow: { fontFamily: 'DMSans_700Bold', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { fontFamily: 'PressStart2P_400Regular', fontSize: 18, lineHeight: 29 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontFamily: 'PressStart2P_400Regular', fontSize: 11, lineHeight: 20 },
  button: { minHeight: 42, paddingHorizontal: 14, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  buttonCompact: { minHeight: 34, paddingHorizontal: 10 },
  buttonText: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
  chip: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 8 },
  chipText: { fontFamily: 'DMSans_700Bold', fontSize: 12 },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, fontFamily: 'DMSans_400Regular', fontSize: 15 },
  state: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 12 },
  stateText: { fontFamily: 'DMSans_600SemiBold', fontSize: 14 },
  errorText: { fontFamily: 'DMSans_600SemiBold', fontSize: 14, lineHeight: 21 },
  empty: { minHeight: 130, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 8 },
  emptyMark: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center' },
  emptyPixel: { width: 9, height: 9 },
  emptyTitle: { fontFamily: 'DMSans_700Bold', fontSize: 15 },
  emptyText: { fontFamily: 'DMSans_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  bar: { height: 14, borderWidth: 2, padding: 2 },
  barFill: { height: '100%' },
  meta: { fontFamily: 'DMSans_500Medium', fontSize: 12 },
});
