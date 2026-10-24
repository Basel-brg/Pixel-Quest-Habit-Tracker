import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Pressable, Text, View } from '@/components/Themed';
import { useColors } from '@/hooks/useColors';
import { SectionHeading } from '@/components/PixelUI';

export function EntryFormModal({
  visible,
  title,
  onClose,
  children,
  actions,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        accessibilityViewIsModal
        style={[
          styles.screen,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
          },
        ]}
      >
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <SectionHeading title={title} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close form"
            testID="button-close-entry-form"
            onPress={onClose}
            style={[styles.closeButton, { borderColor: colors.border }]}
          >
            <Feather name="x" size={19} color={colors.foreground} />
          </Pressable>
        </View>
        <KeyboardAwareScrollViewCompat
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 16) + 24 },
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          bottomOffset={84}
        >
          {children}
        </KeyboardAwareScrollViewCompat>
        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          {actions}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  content: { padding: 18, gap: 12 },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
});
