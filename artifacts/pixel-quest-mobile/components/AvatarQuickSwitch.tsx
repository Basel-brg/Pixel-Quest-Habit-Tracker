import { useState } from 'react';
import { ActivityIndicator, Modal as NativeModal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useGetPixelQuestProfile, useUpdatePixelQuestProfile, getGetPixelQuestProfileQueryKey, type AvatarId } from '@workspace/api-client-react';
import { PixelAvatar } from '@/components/PixelAvatar';
import { MetaText, PixelButton } from '@/components/PixelUI';
import { Text, View } from '@/components/Themed';
import { useColors } from '@/hooks/useColors';
import { invalidatePixelQuest } from '@/lib/pixel-quest';
import { useTheme } from '@/lib/theme';
import { themedLabel } from '@/constants/avatarArt';
import * as Haptics from 'expo-haptics';

const xpAtLevel = (level: number) => Math.max(0, level - 1) * level * 50;

export function AvatarQuickSwitch({ fallbackAvatarId = 'novice' }: { fallbackAvatarId?: AvatarId }) {
  const colors = useColors();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const query = useGetPixelQuestProfile();
  const update = useUpdatePixelQuestProfile();
  const [open, setOpen] = useState(false);
  const [previewAvatar, setPreviewAvatar] = useState<AvatarId | null>(null);
  const [error, setError] = useState('');
  const profile = query.data;
  const avatarId = previewAvatar ?? profile?.avatarId ?? fallbackAvatarId;
  const next = profile?.avatars.filter((avatar) => !avatar.unlocked).sort((a, b) => a.requiredLevel - b.requiredLevel)[0];
  const lastUnlockedLevel = Math.max(1, ...(profile?.avatars.filter((avatar) => avatar.unlocked).map((avatar) => avatar.requiredLevel) ?? []));
  const startXp = xpAtLevel(lastUnlockedLevel);
  const targetXp = next ? xpAtLevel(next.requiredLevel) : startXp;
  const xpRemaining = Math.max(0, targetXp - (profile?.xp ?? 0));
  const progress = next ? Math.max(0, Math.min(100, (((profile?.xp ?? 0) - startXp) / Math.max(1, targetXp - startXp)) * 100)) : 100;

  const close = () => {
    if (update.isPending) return;
    setOpen(false);
    setError('');
  };
  const equip = (id: AvatarId) => {
    if (!profile || update.isPending || id === profile.avatarId) return;
    setError('');
    setPreviewAvatar(id);
    update.mutate({ data: { avatarId: id } }, {
      onSuccess: () => {
        const key = getGetPixelQuestProfileQueryKey();
        const existing = queryClient.getQueryData<typeof profile>(key);
        if (existing) queryClient.setQueryData(key, { ...existing, avatarId: id });
        invalidatePixelQuest(queryClient);
        setPreviewAvatar(null);
        setOpen(false);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onError: (failure) => {
        setPreviewAvatar(null);
        setError(failure.message || 'Avatar could not be equipped.');
      },
    });
  };

  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open avatar quick switch"
      accessibilityHint="Choose an unlocked character"
      accessibilityState={{ expanded: open }}
      testID="button-header-avatar"
      onPress={() => { setError(''); setOpen(true); }}
      style={[styles.headerButton, { backgroundColor: colors.sidebar, borderColor: colors.gold }]}
    >
      <PixelAvatar id={avatarId} size={42}/>
      <View style={[styles.headerBadge, { backgroundColor: colors.gold }]}>
        <Feather name="chevron-down" size={11} color={colors.background}/>
      </View>
    </Pressable>

    <NativeModal visible={open} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close avatar selector" style={StyleSheet.absoluteFill} onPress={close}/>
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[styles.eyebrow, { color: colors.cyan }]}>CHARACTER COLLECTION</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>QUICK SWITCH</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close avatar selector" disabled={update.isPending} onPress={close} style={[styles.closeButton, { borderColor: colors.border }]} testID="button-close-avatar-switch">
              <Feather name="x" size={19} color={colors.mutedForeground}/>
            </Pressable>
          </View>

          {query.isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.cyan}/><MetaText>Loading your avatars...</MetaText></View> : query.isError || !profile ? (
            <View style={styles.loading}><Text style={{ color: colors.destructive }}>Your avatar collection could not load.</Text><PixelButton label="RETRY" tone="quiet" onPress={() => void query.refetch()} testID="button-retry-avatar-switch"/></View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {next ? (
                <View style={[styles.progressCard, { backgroundColor: colors.sidebar, borderColor: colors.border }]} testID="avatar-progression">
                  <View style={styles.progressTop}>
                    <View style={[styles.lockedPreview, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <PixelAvatar id={next.id} size={58} locked/>
                      <Feather name="lock" size={14} color={colors.mutedForeground} style={styles.lockIcon}/>
                    </View>
                    <View style={{ flex: 1, gap: 5 }}>
                      <MetaText>NEXT AVATAR</MetaText>
                      <Text style={[styles.avatarName, { color: colors.foreground }]}>{themedLabel(theme.themeId, next.id, next).name}</Text>
                      <Text style={[styles.requirement, { color: colors.cyan }]}>Level {next.requiredLevel} required · {Math.max(0, next.requiredLevel - profile.level)} levels remaining</Text>
                      <MetaText>{xpRemaining.toLocaleString()} XP remaining</MetaText>
                    </View>
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.gold }]}/>
                  </View>
                  <MetaText>{Math.floor(progress)}% TO UNLOCK</MetaText>
                </View>
              ) : <Text style={[styles.allUnlocked, { color: colors.gold }]}>All avatars unlocked. Choose any character below.</Text>}

              <Text style={[styles.section, { color: colors.mutedForeground }]}>UNLOCKED · TAP TO EQUIP</Text>
              <View style={styles.avatarGrid}>
                {profile.avatars.filter((avatar) => avatar.unlocked).map((avatar) => {
                  const selected = avatar.id === profile.avatarId;
                  const label = themedLabel(theme.themeId, avatar.id, avatar);
                  return <Pressable
                    key={avatar.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${label.name}${selected ? ', equipped' : ', tap to equip'}`}
                    testID={`quick-avatar-${avatar.id}`}
                    disabled={selected || update.isPending}
                    onPress={() => equip(avatar.id)}
                    style={[styles.avatarCard, { backgroundColor: colors.sidebar, borderColor: selected ? colors.gold : colors.border }]}
                  >
                    <PixelAvatar id={avatar.id} size={50}/>
                    <View style={styles.avatarText}>
                      <Text style={[styles.avatarName, { color: colors.foreground }]} numberOfLines={1}>{label.name}</Text>
                      <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 11 }}>{label.role}</Text>
                    </View>
                    {selected ? <Feather name="check" size={17} color={colors.gold}/> : null}
                  </Pressable>;
                })}
              </View>

              {profile.avatars.some((avatar) => !avatar.unlocked) ? <>
                <Text style={[styles.section, { color: colors.mutedForeground }]}>LOCKED PREVIEW</Text>
                <View style={styles.avatarGrid}>
                  {profile.avatars.filter((avatar) => !avatar.unlocked).map((avatar) => <View key={avatar.id} testID={`quick-avatar-locked-${avatar.id}`} style={[styles.avatarCard, { backgroundColor: colors.sidebar, borderColor: colors.border, opacity: 0.7 }]}>
                    <View style={styles.lockedPreview}><PixelAvatar id={avatar.id} size={50} locked/><Feather name="lock" size={13} color={colors.mutedForeground} style={styles.lockIcon}/></View>
                    <View style={styles.avatarText}>
                      <Text style={[styles.avatarName, { color: colors.foreground }]} numberOfLines={1}>{themedLabel(theme.themeId, avatar.id, avatar).name}</Text>
                      <MetaText>Unlock at Level {avatar.requiredLevel}</MetaText>
                    </View>
                  </View>)}
                </View>
              </> : null}
              {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
            </ScrollView>
          )}
        </SafeAreaView>
      </View>
    </NativeModal>
  </>;
}

const styles = StyleSheet.create({
  headerButton: { width: 52, height: 52, borderWidth: 2, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  headerBadge: { position: 'absolute', bottom: -3, right: -3, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.68)' },
  sheet: { maxHeight: '88%', borderWidth: 2, borderBottomWidth: 0, paddingTop: 18, paddingHorizontal: 18 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  eyebrow: { fontFamily: 'PressStart2P_400Regular', fontSize: 7, letterSpacing: 1 },
  title: { fontFamily: 'PressStart2P_400Regular', fontSize: 11, lineHeight: 19 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  scrollContent: { gap: 14, paddingBottom: 22 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12 },
  progressCard: { borderWidth: 1, padding: 12, gap: 10 },
  progressTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lockedPreview: { position: 'relative', width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  lockIcon: { position: 'absolute', bottom: 0, right: 0 },
  avatarName: { fontFamily: 'DMSans_700Bold', fontSize: 12 },
  requirement: { fontFamily: 'DMSans_600SemiBold', fontSize: 11 },
  progressTrack: { height: 12, borderWidth: 1, overflow: 'hidden' },
  progressFill: { height: '100%' },
  allUnlocked: { fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 20 },
  section: { fontFamily: 'PressStart2P_400Regular', fontSize: 7, letterSpacing: 0.5, marginTop: 4 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  avatarCard: { minHeight: 76, width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2, padding: 7 },
  avatarText: { flex: 1, gap: 5, minWidth: 0 },
});
