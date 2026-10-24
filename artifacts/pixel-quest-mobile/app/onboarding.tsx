import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Platform, StyleSheet, Switch, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGetRpgStateQueryKey, useGetRpgState, usePerformRpgAction, type RpgActionInput, type RpgSnapshot } from '@workspace/api-client-react';
import { Pressable, Text, View } from '@/components/Themed';
import { ErrorState, LoadingState, Panel, PixelButton } from '@/components/PixelUI';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { PixelAvatar } from '@/components/PixelAvatar';
import { SkillRadar } from '@/components/SkillRadar';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/lib/theme';
import { invalidatePixelQuest } from '@/lib/pixel-quest';
import { THEME_IDS, THEMES, THEME_PREVIEW_IMAGES, type ThemeId } from '@/constants/themes';
import { HABIT_PRESETS, PATHS, REWARD_PRESETS, STARTER_XP, formFromServer, stepError, toPayload, type DraftForm, type HeroPath } from '@/lib/onboarding';

const STEPS = [
  { en: 'The Call to Adventure', ar: 'نداء المغامرة' },
  { en: 'Choose Your Hero Path', ar: 'تحديد مسار التطوير' },
  { en: 'Forge Your First Habit', ar: 'صياغة العادة الأولى' },
  { en: 'Lock Your First Real Reward', ar: 'قفل أول مكافأة واقعية' },
  { en: 'The Journey Begins', ar: 'الانطلاق والمكافأة الترحيبية' },
];
const rid = () => `ob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
function errMsg(e: unknown) { const x = e as { data?: { error?: string; message?: string } | null; message?: string }; return x?.data?.error || x?.data?.message || x?.message || 'Could not reach camp. Check your connection and retry.'; }

export default function OnboardingScreen() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const colors = useColors();
  const { tokens, setPreview } = useTheme();
  const insets = useSafeAreaInsets();
  const state = useGetRpgState();
  const action = usePerformRpgAction();
  const mutateRef = useRef(action.mutateAsync); mutateRef.current = action.mutateAsync;
  const fanfare = useAudioPlayer(require('../assets/audio/treasure.wav'));
  const [form, setForm] = useState<DraftForm | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<'' | 'next' | 'finish' | 'skip'>('');
  const [saveState, setSaveState] = useState<'' | 'saving' | 'saved' | 'failed'>('');
  const [done, setDone] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reduce, setReduce] = useState(false);
  const burst = useRef(new Animated.Value(0)).current;
  const initFor = useRef<string | null>(null);
  const lastSaved = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busyRef = useRef(false);
  const inflight = useRef(false);
  const actor = useRef(userId); actor.current = userId;

  useEffect(() => { void AsyncStorage.getItem('pixelquest-reward-muted').then((v) => setMuted(v === 'true')).catch(() => undefined); void AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => undefined); }, []);
  // Init once per account; refetches never overwrite in-progress edits.
  useEffect(() => {
    const snap = state.data; if (!snap || !userId || initFor.current === userId) return;
    initFor.current = userId;
    const f = formFromServer(snap.profile.onboardingDraft, snap.profile);
    lastSaved.current = JSON.stringify(toPayload(f));
    setForm(f); setPreview(f.themeId);
  }, [state.data, userId, setPreview]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); setPreview(null); }, [setPreview]);

  const send = useCallback(async (input: Omit<RpgActionInput, 'requestId'>, deferCache = false): Promise<RpgSnapshot | null> => {
    const me = actor.current;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await mutateRef.current({ data: { ...input, requestId: rid() } });
        if (actor.current !== me) return null;
        if (deferCache) return res;
        await qc.cancelQueries({ queryKey: getGetRpgStateQueryKey() });
        qc.setQueryData(getGetRpgStateQueryKey(), res);
        invalidatePixelQuest(qc);
        return res;
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (input.action === 'onboardingDraft' && attempt < 1 && (status === undefined || status >= 500)) { await new Promise((r) => setTimeout(r, 700)); continue; }
        throw e;
      }
    }
  }, [qc]);
  const save = useCallback(async (f: DraftForm, step: number, silent: boolean) => {
    const payload = toPayload(f, step); const body = JSON.stringify(payload);
    if (silent && body === lastSaved.current) return true;
    if (inflight.current) return false;
    inflight.current = true; setSaveState('saving');
    try { await send({ action: 'onboardingDraft', onboardingDraft: payload }); lastSaved.current = body; setSaveState('saved'); return true; }
    catch (e) { setSaveState('failed'); if (!silent) setErr(errMsg(e)); return false; }
    finally { inflight.current = false; }
  }, [send]);

  useEffect(() => {
    if (!form || busyRef.current || done) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (!busyRef.current) void save(form, form.step, true); }, 1400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [form, save, done]);

  if (!form) {
    return <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {state.isError ? <ErrorState message="We couldn't load your save file." retry={() => void state.refetch()}/> : <LoadingState label="Opening the gates..."/>}
    </View>;
  }
  const f = form;
  const locked = !!busy || done;
  const set = (patch: Partial<DraftForm>) => { setErr(''); setForm((p) => (p ? { ...p, ...patch } : p)); };
  const tap = () => { void Haptics.selectionAsync().catch(() => undefined); };
  const go = async (to: number) => {
    if (to > f.step) { const e = stepError(f, f.step); if (e) { setErr(e); return; } }
    busyRef.current = true; setBusy('next'); if (timer.current) clearTimeout(timer.current);
    const ok = await save(f, to, false);
    busyRef.current = false; setBusy('');
    if (ok) { tap(); setForm((p) => (p ? { ...p, step: to } : p)); }
  };
  const finish = async () => {
    for (const s of [1, 2, 3, 4]) { const e = stepError(f, s); if (e) { setErr(e); set({ step: s }); return; } }
    busyRef.current = true; setBusy('finish'); setErr(''); if (timer.current) clearTimeout(timer.current);
    try {
      await qc.cancelQueries({ queryKey: getGetRpgStateQueryKey() });
      const r = await send({ action: 'completeOnboarding', onboardingDraft: toPayload(f, 5) }, true);
      if (!r?.profile.hasCompletedOnboarding) throw new Error('Camp did not confirm your setup. Retry.');
      setDone(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (!muted) void fanfare.seekTo(0).then(() => fanfare.play()).catch(() => undefined);
      if (!reduce) Animated.timing(burst, { toValue: 1, duration: 1100, useNativeDriver: Platform.OS !== 'web' }).start();
      setTimeout(() => { qc.setQueryData(getGetRpgStateQueryKey(), r); invalidatePixelQuest(qc); router.replace('/(tabs)'); }, reduce ? 250 : 1500);
    } catch (e) {
      const m = errMsg(e); setErr(m); if (/username/i.test(m)) set({ step: 1 });
      busyRef.current = false; setBusy('');
    }
  };
  const skip = async () => {
    busyRef.current = true; setBusy('skip'); setErr(''); if (timer.current) clearTimeout(timer.current);
    try { const r = await send({ action: 'skipOnboarding' }); if (r?.profile.hasCompletedOnboarding) { router.replace('/(tabs)'); return; } throw new Error('Skip was not confirmed. Retry.'); }
    catch (e) { setErr(errMsg(e)); busyRef.current = false; setBusy(''); }
  };
  const snap = state.data!;
  const radius = tokens.radius.md;
  const card = (sel: boolean) => ({ borderWidth: tokens.border.panel, borderColor: sel ? colors.gold : colors.border, backgroundColor: colors.card, borderRadius: radius });
  const input = { borderWidth: tokens.border.control, borderColor: colors.border, backgroundColor: colors.sidebar, color: colors.foreground, borderRadius: radius, fontFamily: tokens.fontMap.DMSans_400Regular };
  const pathName = PATHS.find((p) => p.id === f.heroPath)?.name;
  const webTop = Platform.OS === 'web' ? 67 : 0;

  return <View style={{ flex: 1, backgroundColor: colors.background }} testID={`onboarding-step-${f.step}`}>
    <View style={[s.top, { paddingTop: insets.top + webTop + 8, borderBottomColor: colors.border, borderBottomWidth: tokens.border.panel }]}>
      <View style={{ flexDirection: 'row', gap: 5 }}>{STEPS.map((_, i) => <View key={i} testID={`progress-step-${i + 1}`} style={{ height: 8, width: i + 1 === f.step ? 26 : 8, backgroundColor: i + 1 === f.step ? colors.gold : i + 1 < f.step ? colors.cyan : colors.border, borderRadius: tokens.radius.pill ? 4 : 0 }}/>)}</View>
      <Pressable testID="button-onboarding-skip" accessibilityRole="button" disabled={locked} onPress={() => void skip()} hitSlop={10}><Text style={{ color: colors.mutedForeground, fontWeight: '700', fontSize: 13, opacity: locked ? 0.4 : 1 }}>{busy === 'skip' ? 'Skipping…' : 'Skip setup (تخطي)'}</Text></Pressable>
    </View>

    <KeyboardAwareScrollViewCompat style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 140 + insets.bottom, gap: 16 }} keyboardShouldPersistTaps="handled" bottomOffset={120}>
      <Text style={[s.eyebrow, tokens.eyebrow, { color: colors.cyan }]}>Step {f.step} of 5 · {STEPS[f.step - 1].ar}</Text>
      <Text style={[tokens.title, { color: colors.foreground }]}>{STEPS[f.step - 1].en}</Text>

      {f.step === 1 && <>
        <Panel><Text style={[s.label, { color: colors.mutedForeground }]}>Hero name</Text>
          <TextInput testID="input-onboarding-username" value={f.username} editable={!locked} maxLength={20} autoCapitalize="none" autoCorrect={false} onChangeText={(v) => set({ username: v })} placeholder="e.g. Layla_Ironleaf" placeholderTextColor={colors.mutedForeground} style={[s.input, input]}/>
          <Text style={[s.hint, { color: colors.mutedForeground }]}>3–20 letters, numbers or underscore. Must be unique.</Text></Panel>
        <Text style={{ color: colors.mutedForeground }}>Pick the world your hero lives in — tap to preview live.</Text>
        <View style={s.grid}>{THEME_IDS.map((t: ThemeId) => { const sel = f.themeId === t; return <Pressable key={t} testID={`card-theme-${t}`} accessibilityRole="radio" accessibilityState={{ selected: sel }} disabled={locked} onPress={() => { set({ themeId: t }); setPreview(t); tap(); }} style={[s.themeCard, card(sel)]}>
          <Image source={THEME_PREVIEW_IMAGES[t]} style={{ width: '100%', aspectRatio: 1.5, borderTopLeftRadius: radius, borderTopRightRadius: radius }} accessibilityLabel={`${THEMES[t].name} Camp preview`}/>
          <View style={{ padding: 9, flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 13 }}>{THEMES[t].name}</Text><Text style={{ color: colors.mutedForeground, fontSize: 11 }} numberOfLines={1}>{THEMES[t].blurb}</Text></View>{sel ? <Feather name="check" size={16} color={colors.gold}/> : null}</View>
        </Pressable>; })}</View>
      </>}

      {f.step === 2 && <>
        {PATHS.map((p) => { const sel = f.heroPath === p.id; return <Pressable key={p.id} testID={`card-path-${p.id}`} accessibilityRole="radio" accessibilityState={{ selected: sel }} disabled={locked} onPress={() => { set({ heroPath: p.id }); tap(); }} style={[s.row, card(sel)]}>
          <View style={[s.badge, { backgroundColor: sel ? colors.gold : colors.secondary, borderRadius: Math.min(radius, 10) }]}><Text style={{ color: sel ? colors.background : colors.cyan, fontWeight: '800' }}>{p.id}</Text></View>
          <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 15 }}>{p.name} ({p.ar})</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{p.focus} · grows {p.stat}</Text></View>
        </Pressable>; })}
        <Panel><Text style={{ color: colors.foreground, fontSize: 13, marginBottom: 6 }}>{f.heroPath ? `Your first habit will train ${f.heroPath}. Points arrive only when you complete it.` : 'Choose a path to see which axis your habits will grow.'}</Text>
          <SkillRadar skills={snap.skills} highlight={f.heroPath}/></Panel>
      </>}

      {f.step === 3 && <>
        <Text style={{ color: colors.mutedForeground }}>One-click presets for the {pathName ?? 'chosen path'}:</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{HABIT_PRESETS[(f.heroPath ?? 'STR') as HeroPath].map((h) => { const sel = f.habitTitle === h.title; return <Pressable key={h.id} testID={`preset-habit-${h.id}`} accessibilityState={{ selected: sel }} disabled={locked} onPress={() => { set({ habitTitle: h.title, habitTarget: String(h.target), habitUnit: h.unit }); tap(); }} style={[s.chip, { borderWidth: tokens.border.control + 1, borderColor: sel ? colors.gold : colors.border, backgroundColor: sel ? colors.gold : colors.card, borderRadius: tokens.radius.pill ? 999 : radius }]}><Text style={{ color: sel ? colors.background : colors.foreground, fontWeight: '700' }}>{h.title}</Text></Pressable>; })}</View>
        <Panel>
          <Text style={[s.label, { color: colors.mutedForeground }]}>Habit name (or write your own)</Text>
          <TextInput testID="input-onboarding-habit-title" value={f.habitTitle} editable={!locked} maxLength={120} onChangeText={(v) => set({ habitTitle: v })} placeholder="Walk after dinner" placeholderTextColor={colors.mutedForeground} style={[s.input, input]}/>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}><Text style={[s.label, { color: colors.mutedForeground }]}>Daily target</Text><TextInput testID="input-onboarding-habit-target" keyboardType="decimal-pad" value={f.habitTarget} editable={!locked} onChangeText={(v) => set({ habitTarget: v })} style={[s.input, input]}/></View>
            <View style={{ flex: 1 }}><Text style={[s.label, { color: colors.mutedForeground }]}>Unit</Text><TextInput testID="input-onboarding-habit-unit" value={f.habitUnit} maxLength={30} editable={!locked} onChangeText={(v) => set({ habitUnit: v })} placeholder="minutes" placeholderTextColor={colors.mutedForeground} style={[s.input, input]}/></View>
          </View>
          <View style={[s.row, { marginTop: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.secondary, borderRadius: radius }]}>
            <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: '700' }}>Require Photo Proof (📸)</Text><Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 3 }}>يتطلب إثباتاً بالصورة للحصول على الـ XP</Text></View>
            <Switch testID="toggle-onboarding-photo-proof" value={f.requiresPhotoProof} disabled={locked} onValueChange={(v) => set({ requiresPhotoProof: v })} trackColor={{ true: colors.gold, false: colors.border }}/>
          </View>
        </Panel>
      </>}

      {f.step === 4 && <>
        <Text style={{ color: colors.foreground, fontSize: 15, textAlign: 'right' }}>ما المكافأة الواقعية التي تستحق أن تكافئ بها نفسك عند الالتزام؟</Text>
        {REWARD_PRESETS.map((r) => { const sel = f.rewardTitle === r.title; return <Pressable key={r.id} testID={`preset-reward-${r.id}`} accessibilityState={{ selected: sel }} disabled={locked} onPress={() => { set({ rewardTitle: r.title, rewardStreak: String(r.streak) }); tap(); }} style={[s.row, card(sel)]}>
          <View style={{ flex: 1, gap: 4 }}><Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 15 }}>{r.title}</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Locked until {r.hint}</Text></View>
          {sel ? <Feather name="lock" size={16} color={colors.gold}/> : null}
        </Pressable>; })}
        <Panel>
          <Text style={[s.label, { color: colors.mutedForeground }]}>Reward title</Text>
          <TextInput testID="input-onboarding-reward-title" value={f.rewardTitle} editable={!locked} maxLength={120} onChangeText={(v) => set({ rewardTitle: v })} placeholder="New headphones" placeholderTextColor={colors.mutedForeground} style={[s.input, input]}/>
          <Text style={[s.label, { color: colors.mutedForeground, marginTop: 10 }]}>Streak (days)</Text>
          <TextInput testID="input-onboarding-reward-streak" keyboardType="number-pad" value={f.rewardStreak} editable={!locked} onChangeText={(v) => set({ rewardStreak: v })} style={[s.input, input]}/>
          <Text style={[s.hint, { color: colors.mutedForeground }]}>Unlocks at Level 2 AND a {f.rewardStreak || '?'}-day streak on your first habit.</Text>
        </Panel>
      </>}

      {f.step === 5 && <>
        <Panel><View style={{ alignItems: 'center', gap: 8 }}>
          <PixelAvatar id={snap.profile.avatarId} size={120}/>
          <Text testID="text-onboarding-username" style={[tokens.section, { color: colors.foreground }]}>{f.username}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{pathName}</Text>
        </View></Panel>
        <View style={[s.row, card(false)]}><Image source={THEME_PREVIEW_IMAGES[f.themeId]} style={{ width: 96, aspectRatio: 1.5, borderRadius: Math.min(radius, 8) }}/><View style={{ flex: 1 }}><Text style={[s.label, { color: colors.cyan }]}>WORLD</Text><Text style={{ color: colors.foreground, fontWeight: '700' }}>{THEMES[f.themeId].name}</Text></View></View>
        <View testID="text-onboarding-habit" style={[s.row, card(false)]}><View style={{ flex: 1 }}><Text style={[s.label, { color: colors.cyan }]}>FIRST HABIT</Text><Text style={{ color: colors.foreground, fontWeight: '700' }}>{f.habitTitle}</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{f.habitTarget} {f.habitUnit} daily · {f.heroPath}{f.requiresPhotoProof ? ' · photo proof' : ''}</Text></View></View>
        <View testID="text-onboarding-reward" style={[s.row, card(false)]}><Feather name="lock" size={16} color={colors.gold}/><View style={{ flex: 1 }}><Text style={[s.label, { color: colors.cyan }]}>LOCKED REWARD</Text><Text style={{ color: colors.foreground, fontWeight: '700' }}>{f.rewardTitle}</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Level 2 + {f.rewardStreak}-day streak</Text></View></View>
        <View testID="status-starter-xp" style={[s.row, { borderWidth: 2, borderStyle: 'dashed', borderColor: done ? colors.gold : colors.border, borderRadius: radius }]}>
          <Feather name="star" size={20} color={colors.gold}/>
          <View style={{ flex: 1 }}><Text style={[tokens.section, { color: colors.gold }]}>+{STARTER_XP} XP</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{done ? 'Starter XP awarded. Welcome to camp.' : 'Pending — awarded the moment you enter camp.'}</Text></View>
        </View>
      </>}
    </KeyboardAwareScrollViewCompat>

    {done && !reduce ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>{Array.from({ length: 26 }, (_, i) => <Animated.View key={i} style={{ position: 'absolute', left: `${(i * 37) % 95}%`, top: `${25 + ((i * 23) % 50)}%`, width: 9, height: 9, backgroundColor: [colors.gold, colors.cyan, colors.purple, colors.destructive][i % 4], opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, -60 - (i % 5) * 12] }) }] }}/>)}</View> : null}

    <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16), backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: tokens.border.panel }]}>
      {err ? <Text testID="status-onboarding-error" accessibilityLiveRegion="polite" style={{ color: colors.destructive, fontSize: 12, marginBottom: 8 }}>{err}</Text> : saveState === 'failed' ? <Text testID="status-onboarding-save" style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 8 }}>Draft not saved — will retry</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><PixelButton testID="button-onboarding-back" label="Back" tone="quiet" disabled={f.step === 1 || locked} onPress={() => { tap(); set({ step: f.step - 1 }); }}/></View>
        <View style={{ flex: 2 }}>{f.step < 5
          ? <PixelButton testID="button-onboarding-next" label={busy === 'next' ? 'Saving…' : 'Next'} disabled={locked} onPress={() => void go(f.step + 1)}/>
          : <PixelButton testID="button-onboarding-finish" label={busy === 'finish' ? 'Entering…' : done ? 'Welcome!' : 'Enter Camp (ابدأ المغامرة)'} disabled={locked} onPress={() => void finish()}/>}</View>
      </View>
    </View>
  </View>;
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 12 },
  eyebrow: { fontSize: 11 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  hint: { fontSize: 11, marginTop: 6 },
  input: { paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  themeCard: { width: '47%', flexGrow: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  badge: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 11 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12 },
});
