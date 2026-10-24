import { useState } from 'react';
import { ActivityIndicator, Linking, Modal as NativeModal, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { useQueryClient } from '@tanstack/react-query';
import { useVerifyPhoto, type PhotoVerificationInputItemType, type PhotoVerificationInputMimeType } from '@workspace/api-client-react';
import { Text, View } from '@/components/Themed';
import { useColors } from '@/hooks/useColors';
import { invalidatePixelQuest } from '@/lib/pixel-quest';
import * as Haptics from 'expo-haptics';

export type PhotoProofTarget = {
  itemType: PhotoVerificationInputItemType;
  itemId: number;
  title: string;
};

const MAX_IMAGE_BASE64_LENGTH = 7_000_000;

function errorText(error: unknown): string {
  const value = error as { data?: { error?: string }; message?: string };
  return value?.data?.error ?? value?.message ?? 'Photo verification failed. Please try again.';
}

async function discard(uri: string | null | undefined) {
  if (!uri) return;
  try { await new File(uri).delete(); } catch { /* Best effort for temporary camera captures. */ }
}

export function PhotoProofModal({ target, onClose }: { target: PhotoProofTarget | null; onClose: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [nonce] = useState(() => `${Date.now()}-${Math.random()}`);
  const mutationKey = ['verifyPhoto', 'mobile-photo-proof', nonce] as const;
  const verify = useVerifyPhoto({ mutation: { mutationKey } });
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'select' | 'failed' | 'success'>('select');
  const [message, setMessage] = useState('');
  const [settingsNeeded, setSettingsNeeded] = useState(false);

  const clearPrivateMutation = () => {
    verify.reset();
    const cache = queryClient.getMutationCache();
    for (const mutation of cache.getAll()) {
      if (mutation.options.mutationKey?.[0] === 'verifyPhoto' && mutation.options.mutationKey?.[1] === 'mobile-photo-proof' && mutation.options.mutationKey?.[2] === nonce) {
        cache.remove(mutation);
      }
    }
  };

  const selectImage = async (source: 'camera' | 'library') => {
    if (!target || busy) return;
    setMessage('');
    setSettingsNeeded(false);
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setMessage(source === 'camera' ? 'Camera access is needed to take proof photos.' : 'Photo library access is needed to choose a proof photo.');
        setSettingsNeeded(!permission.canAskAgain);
        setStage('failed');
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.7, allowsEditing: false, exif: false })
        : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'], base64: true, quality: 0.7, allowsEditing: false, exif: false, selectionLimit: 1,
          preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.base64) {
        if (source === 'camera') await discard(asset?.uri);
        setMessage('Could not read that photo. Choose another image.');
        setStage('failed');
        return;
      }
      if (asset.base64.length > MAX_IMAGE_BASE64_LENGTH) {
        if (source === 'camera') await discard(asset.uri);
        setMessage('That photo is too large. Choose a smaller image.');
        setStage('failed');
        return;
      }
      const mimeType = asset.mimeType as PhotoVerificationInputMimeType | null;
      if (!mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        if (source === 'camera') await discard(asset.uri);
        setMessage('Choose a JPEG, PNG, or WebP photo.');
        setStage('failed');
        return;
      }

      setBusy(true);
      setStage('select');
      try {
        const result = await verify.mutateAsync({
          data: { itemType: target.itemType, itemId: target.itemId, imageBase64: asset.base64, mimeType },
        });
        if (result.isVerified) {
          invalidatePixelQuest(queryClient);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setMessage(result.reason);
          setStage('success');
        } else {
          setMessage(result.reason);
          setStage('failed');
        }
      } catch (error) {
        setMessage(errorText(error));
        setStage('failed');
      } finally {
        clearPrivateMutation();
        if (source === 'camera') await discard(asset.uri);
        setBusy(false);
      }
    } catch {
      setMessage('Could not open the photo picker. Please try again.');
      setStage('failed');
    }
  };

  const close = () => {
    if (busy) return;
    setStage('select');
    setMessage('');
    setSettingsNeeded(false);
    onClose();
  };

  const retake = () => {
    setMessage('');
    setSettingsNeeded(false);
    setStage('select');
  };

  return (
    <NativeModal visible={!!target} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.headingRow}>
            <View style={styles.titleWrap}>
              <Text style={[styles.eyebrow, { color: colors.cyan }]}>PHOTO VERIFICATION</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>{stage === 'success' ? 'PROOF ACCEPTED' : stage === 'failed' ? 'TRY AGAIN' : 'VERIFY COMPLETION'}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close photo verification"
              disabled={busy}
              onPress={close}
              style={styles.closeButton}
              testID="button-close-photo-proof"
            >
              <Feather name="x" size={19} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {stage === 'success' ? (
            <View style={styles.resultBlock} testID="photo-proof-success">
              <Feather name="check-circle" size={42} color={colors.cyan} />
              <Text style={[styles.resultTitle, { color: colors.gold }]}>{target?.itemType === 'habit' ? 'HABIT COMPLETE' : 'QUEST COMPLETE'}</Text>
              <Text style={[styles.message, { color: colors.foreground }]}>{message}</Text>
              <Text style={[styles.helper, { color: colors.mutedForeground }]}>Your usual XP and Gold rewards were added.</Text>
              <PixelAction label="CONTINUE" onPress={close} testID="button-photo-proof-continue" />
            </View>
          ) : stage === 'failed' ? (
            <View style={styles.resultBlock} testID="photo-proof-failed">
              <Feather name="alert-circle" size={36} color={colors.destructive} />
              <Text style={[styles.message, { color: colors.foreground }]}>{message}</Text>
              <Text style={[styles.helper, { color: colors.mutedForeground }]}>The item remains incomplete and no rewards were added.</Text>
              {settingsNeeded ? <PixelAction label="OPEN SETTINGS" tone="quiet" onPress={() => { void Linking.openSettings().catch(() => undefined); }} testID="button-photo-proof-settings" /> : null}
              <View style={styles.actionRow}>
                <PixelAction label="LEAVE INCOMPLETE" tone="quiet" onPress={close} testID="button-photo-proof-leave" />
                <PixelAction label="RETAKE PHOTO" onPress={retake} testID="button-photo-proof-retake" />
              </View>
            </View>
          ) : (
            <View style={styles.selectBlock}>
              <Text style={[styles.message, { color: colors.foreground }]}>Add a photo that clearly shows evidence for <Text style={{ fontWeight: '700' }}>{target?.title}</Text>.</Text>
              {busy ? (
                <View style={styles.processing}>
                  <ActivityIndicator color={colors.cyan} />
                  <Text style={[styles.helper, { color: colors.mutedForeground }]}>Checking the photo and completing the item…</Text>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <PixelAction label="TAKE PHOTO" onPress={() => void selectImage('camera')} testID="button-photo-proof-camera" icon="camera" />
                  <PixelAction label="CHOOSE PHOTO" tone="quiet" onPress={() => void selectImage('library')} testID="button-photo-proof-library" icon="image" />
                </View>
              )}
              {message ? <Text accessibilityRole="alert" style={[styles.message, { color: colors.destructive }]}>{message}</Text> : null}
              <Text style={[styles.helper, { color: colors.mutedForeground }]}>Images are analyzed once and not saved.</Text>
            </View>
          )}
        </View>
      </View>
    </NativeModal>
  );
}

function PixelAction({ label, onPress, testID, tone = 'primary', icon }: {
  label: string;
  onPress: () => void;
  testID: string;
  tone?: 'primary' | 'quiet';
  icon?: React.ComponentProps<typeof Feather>['name'];
}) {
  const colors = useColors();
  const foreground = tone === 'primary' ? colors.primaryForeground : colors.foreground;
  const background = tone === 'primary' ? colors.primary : colors.secondary;
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={[styles.actionButton, { backgroundColor: background, borderColor: colors.border }]}
    >
      {icon ? <Feather name={icon} size={16} color={foreground} /> : null}
      <Text style={[styles.actionLabel, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 30, backgroundColor: 'rgba(0,0,0,0.72)' },
  dialog: { alignSelf: 'center', width: '100%', maxWidth: 460, borderWidth: 2, padding: 18, gap: 18 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between' },
  titleWrap: { flex: 1, gap: 8 },
  eyebrow: { fontFamily: 'PressStart2P_400Regular', fontSize: 8, letterSpacing: 1 },
  title: { fontFamily: 'PressStart2P_400Regular', fontSize: 12, lineHeight: 20 },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  resultBlock: { alignItems: 'center', gap: 14 },
  resultTitle: { fontFamily: 'PressStart2P_400Regular', fontSize: 10, textAlign: 'center', lineHeight: 18 },
  message: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  helper: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  selectBlock: { gap: 16 },
  processing: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  actionButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 10, flexGrow: 1 },
  actionLabel: { fontFamily: 'DMSans_700Bold', fontSize: 11, textAlign: 'center' },
});
