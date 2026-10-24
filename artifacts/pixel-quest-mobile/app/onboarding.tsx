import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, BackHandler, Image, Platform, StyleSheet, Switch, TextInput } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGetRpgStateQueryKey, getRpgState, useGetRpgState, usePerformRpgAction, type RpgActionInput, type RpgSnapshot } from '@workspace/api-client-react';
import { Pressable, Text, View } from '@/components/Themed';
import { ErrorState, LoadingState, Panel, PixelButton } from '@/components/PixelUI';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { PixelAvatar } from '@/components/PixelAvatar';
import { SkillRadar } from '@/components/SkillRadar';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/lib/theme';
import { invalidatePixelQuest } from '@/lib/pixel-quest';
import { THEME_IDS, THEMES, THEME_PREVIEW_IMAGES, type ThemeId } from '@/constants/themes';
import {
  HABIT_PRESETS, PATHS, REWARD_PRESETS, STARTER_XP, errInfo, formFromServer, gateText, revisionOf, safeStep, stepError, toPayload, withPath, withReward,
  type DraftForm, type HeroPath, type RewardPresetId,
} from '@/lib/onboarding';

const STEPS = [
  { en: 'The Call to Adventure', ar: 'نداء المغامرة' },
  { en: 'Choose Your Hero Path', ar: 'تحديد مسار التطوير' },
  { en: 'Forge Your First Habit', ar: 'صياغة العادة الأولى' },
  { en: 'Lock Your First Real Reward', ar: 'قفل أول مكافأة واقعية' },
  { en: 'The Journey Begins', ar: 'الانطلاق والمكافأة الترحيبية' },
];
const MUTE_KEY = 'pixelquest-reward-muted';
const rid = () => `ob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
const rtl = { writingDirection: 'rtl' as const, textAlign: 'right' as const };
type SaveState = '' | 'saving' | 'saved' | 'failed' | 'conflict';
class Cancelled extends Error {}

export default function OnboardingScreen() {
  const { userId, isLoaded, isSignedIn } = useAuth();
  const qc = useQueryClient();
  const colors = useColors();
  const { tokens, setPreview } = useTheme();
  const insets = useSafeAreaInsets();
  const state = useGetRpgState({ query: { queryKey: getGetRpgStateQueryKey(), enabled: !!userId, refetchInterval: 30000 } });
  const action = usePerformRpgAction();
  const mutateRef = useRef(action.mutateAsync); mutateRef.current = action.mutateAsync;
  const fanfare = useAudioPlayer(require('../assets/audio/treasure.wav'));
  const clicker = useAudioPlayer(require('../assets/audio/treasure.wav'));

  const [form, setForm] = useState<DraftForm | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<'' | 'next' | 'back' | 'finish' | 'skip' | 'reload'>('');
  const [saveState, setSaveState] = useState<SaveState>('');
  const [external, setExternal] = useState(false);
  const [done, setDone] = useState(false);
  const [muted, setMuted] = useState(true);
  const [reduce, setReduce] = useState(false);
  const burst = useRef(new Animated.Value(0)).current;
  const formRef = useRef(form); formRef.current = form;
  const revRef = useRef(0);
  const lastSaved = useRef('');
  const conflictRef = useRef(false);
  const inflight = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const autosave = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const actor = useRef(userId); actor.current = userId;
  const mounted = useRef(true);
  const mutedRef = useRef(muted); mutedRef.current = muted;
  const later = (fn: () => void, ms: number) => { const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms); timers.current.add(t); };

  // Preferences: mute (shared with Rewards fanfare) and live reduced-motion subscription.
  useEffect(() => {
    const readMute = () => { void AsyncStorage.getItem(MUTE_KEY).then((v) => { if (mounted.current) setMuted(v === 'true'); }).catch(() => undefined); };
    readMute();
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted.current) setReduce(v); }).catch(() => undefined);
    const rm = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduce(v));
    const app = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      readMute();
      if (!inflight.current) void qc.invalidateQueries({ queryKey: getGetRpgStateQueryKey() });
    });
    return () => { rm.remove(); app.remove(); };
  }, [qc]);
  useEffect(() => {
    mounted.current = true;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      if (autosave.current) clearTimeout(autosave.current);
      pending.forEach(clearTimeout); pending.clear();
      anim.current?.stop();
      setPreview(null);
    };
  }, [setPreview]);

  const adopt = useCallback((s: RpgSnapshot) => {
    const f = formFromServer(s.profile.onboardingDraft, s.profile);
    revRef.current = revisionOf(s);
    lastSaved.current = JSON.stringify(toPayload(f));
    conflictRef.current = false;
    setExternal(false); setSaveState(''); setErr('');
    setForm(f); setPreview(f.themeId);
  }, [setPreview]);

  const live = state.data;
  const initFor = useRef<string | null>(null);
  useEffect(() => {
    if (!live || !userId || initFor.current === userId) return;
    initFor.current = userId; adopt(live);
  }, [live, userId, adopt]);
  // Another device moved the draft forward: adopt if clean, otherwise ask.
  useEffect(() => {
    const f = formRef.current;
    if (!live || !f || initFor.current !== userId || inflight.current || live.profile.hasCompletedOnboarding) return;
    if (revisionOf(live) <= revRef.current) return;
    if (JSON.stringify(toPayload(f)) !== lastSaved.current) setExternal(true); else adopt(live);
  }, [live, userId, adopt]);

  const send = useCallback(async (input: Omit<RpgActionInput, 'requestId'>, deferCache = false): Promise<RpgSnapshot> => {
    const me = actor.current;
    if (!me) throw new Cancelled();
    inflight.current++;
    try {
      await qc.cancelQueries({ queryKey: getGetRpgStateQueryKey() });
      const res = await mutateRef.current({ data: { ...input, requestId: rid() } });
      if (!mounted.current || actor.current !== me) throw new Cancelled();
      revRef.current = revisionOf(res);
      if (!deferCache) {
        await qc.cancelQueries({ queryKey: getGetRpgStateQueryKey() });
        qc.setQueryData(getGetRpgStateQueryKey(), res);
        invalidatePixelQuest(qc); // theme provider re-reads profile timestamp
      }
      return res;
    } finally { inflight.current--; }
  }, [qc]);

  const fail = useCallback((e: unknown, explicit: boolean) => {
    if (e instanceof Cancelled) return;
    const { status, message } = errInfo(e);
    if (status === 409 && !/username/i.test(message)) { conflictRef.current = true; setSaveState('conflict'); return; }
    setSaveState('failed');
    if (explicit || /username/i.test(message)) setErr(message);
  }, []);

  const save = useCallback((f: DraftForm, step: number, explicit: boolean): Promise<boolean> => {
    const job = async () => {
      if (conflictRef.current) return false;
      const payload = toPayload(f, step); const body = JSON.stringify(payload);
      if (!explicit && body === lastSaved.current) return true;
      setSaveState('saving');
      try {
        await send({ action: 'onboardingDraft', onboardingDraft: payload, expectedOnboardingRevision: revRef.current });
        lastSaved.current = body; setSaveState('saved'); return true;
      } catch (e) { fail(e, explicit); return false; }
    };
    const p = chain.current.then(job, job);
    chain.current = p;
    return p;
  }, [send, fail]);

  useEffect(() => {
    if (!form || busy || done || external || saveState === 'conflict') return;
    if (autosave.current) clearTimeout(autosave.current);
    autosave.current = setTimeout(() => { const f = formRef.current; if (f) void save(f, safeStep(f), false); }, 1200);
    return () => { if (autosave.current) clearTimeout(autosave.current); };
  }, [form, busy, done, external, saveState, save]);

  const step = form?.step;
  useEffect(() => { if (step) AccessibilityInfo.announceForAccessibility(`Step ${step} of 5: ${STEPS[step - 1].en}`); }, [step]);

  // Android hardware back walks the wizard (server-confirmed), never into the app.
  const goRef = useRef<(to: number) => void>(() => undefined);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { const f = formRef.current; if (f && f.step > 1) { goRef.current(f.step - 1); return true; } return false; });
    return () => sub.remove();
  }, []);

  const reloadServer = async () => {
    const me = actor.current;
    setBusy('reload');
    try {
      await chain.current.catch(() => undefined);
      const s = await qc.fetchQuery({ queryKey: getGetRpgStateQueryKey(), queryFn: ({ signal }) => getRpgState({ signal }), staleTime: 0 });
      if (mounted.current && actor.current === me) adopt(s);
    } catch (e) { if (mounted.current && actor.current === me) setErr(errInfo(e).message); }
    finally { if (mounted.current) setBusy(''); }
  };

  if (isLoaded && !isSignedIn) return <Redirect href="/(auth)/sign-in"/>;
  if (!form) {
    return <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {state.isError ? <ErrorState message="We couldn't load your save file." retry={() => void state.refetch()}/> : <LoadingState label="Opening the gates..."/>}
    </View>;
  }
  const f = form;
  const stalled = saveState === 'conflict' || external;
  const locked = !!busy || done || stalled;
  const set = (patch: Partial<DraftForm>) => { setErr(''); setForm((p) => (p ? { ...p, ...patch } : p)); };
  const tap = () => { void Haptics.selectionAsync().catch(() => undefined); };
  const click = () => {
    tap();
    if (mutedRef.current) return;
    try { clicker.volume = 0.18; void clicker.seekTo(0).then(() => clicker.play()).catch(() => undefined); later(() => { try { clicker.pause(); } catch { /* released */ } }, 160); } catch { /* audio optional */ }
  };

  const go = async (to: number) => {
    if (locked) return;
    if (to > f.step) { const e = stepError(f, f.step); if (e) { setErr(e); return; } }
    setBusy(to > f.step ? 'next' : 'back'); if (autosave.current) clearTimeout(autosave.current); setErr('');
    const ok = await save(f, to, true);
    if (!mounted.current) return;
    setBusy('');
    if (ok) { tap(); setForm((p) => (p ? { ...p, step: to } : p)); }
  };
  goRef.current = (to) => void go(to);
  const finish = async () => {
    for (const s of [1, 2, 3, 4]) { const e = stepError(f, s); if (e) { setErr(e); return; } }
    const me = actor.current;
    setBusy('finish'); setErr(''); if (autosave.current) clearTimeout(autosave.current);
    await chain.current.catch(() => undefined);
    if (conflictRef.current) { setBusy(''); return; }
    try {
      const r = await send({ action: 'completeOnboarding', onboardingDraft: toPayload(f, 5), expectedOnboardingRevision: revRef.current }, true);
      if (!r.profile.hasCompletedOnboarding) throw new Error('Camp did not confirm your setup. Try again.');
      if (r.effect !== 'reward') {
        qc.setQueryData(getGetRpgStateQueryKey(), r); invalidatePixelQuest(qc);
        router.replace('/(tabs)'); return;
      }
      // Account-local celebration; cleared on unmount. Cache flips only when we leave.
      setDone(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (!mutedRef.current) { try { fanfare.volume = 0.6; void fanfare.seekTo(0).then(() => fanfare.play()).catch(() => undefined); } catch { /* audio optional */ } }
      if (!reduce) { anim.current = Animated.timing(burst, { toValue: 1, duration: 1000, useNativeDriver: Platform.OS !== 'web' }); anim.current.start(); }
      later(() => {
        if (actor.current !== me) return;
        qc.setQueryData(getGetRpgStateQueryKey(), r); invalidatePixelQuest(qc);
        router.replace('/(tabs)');
      }, reduce ? 150 : 1100);
    } catch (e) {
      if (!mounted.current || e instanceof Cancelled) return;
      fail(e, true);
      if (/username/i.test(errInfo(e).message)) setForm((p) => (p ? { ...p, step: 1 } : p));
      setBusy('');
    }
  };
  const skip = async () => {
    setBusy('skip'); setErr(''); if (autosave.current) clearTimeout(autosave.current);
    await chain.current.catch(() => undefined);
    try { const r = await send({ action: 'skipOnboarding' }); if (r.profile.hasCompletedOnboarding) { router.replace('/(tabs)'); return; } throw new Error('Skip was not confirmed. Try again.'); }
    catch (e) { if (!mounted.current || e instanceof Cancelled) return; setErr(errInfo(e).message); setBusy(''); }
  };
  const pickTheme = (t: ThemeId) => { set({ themeId: t }); setPreview(t); click(); };
  const pickPath = (p: HeroPath) => { set(withPath(f, p)); tap(); };
  const pickReward = (id: RewardPresetId) => { set(withReward(id, f)); tap(); };

  const snap = live!;
  const radius = tokens.radius.md;
  const card = (sel: boolean) => ({ borderWidth: tokens.border.panel, borderColor: sel ? colors.gold : colors.border, backgroundColor: colors.card, borderRadius: radius });
  const input = { borderWidth: tokens.border.control, borderColor: colors.border, backgroundColor: colors.sidebar, color: colors.foreground, borderRadius: radius, fontFamily: tokens.fontMap.DMSans_400Regular };
  const pathName = PATHS.find((p) => p.id === f.heroPath)?.name;
  const itemGate = f.rewardPresetId === 'item';
  const webTop = Platform.OS === 'web' ? 67 : 0;
  const chipStyle = (sel: boolean, dashed = false) => [s.chip, { borderWidth: tokens.border.control + 1, borderStyle: dashed && !sel ? 'dashed' as const : 'solid' as const, borderColor: sel ? colors.gold : colors.border, backgroundColor: sel ? colors.gold : colors.card, borderRadius: tokens.radius.pill ? 999 : radius }];

  return <View style={{ flex: 1, backgroundColor: colors.background }} testID={`onboarding-step-${f.step}`}>
    <View style={[s.top, { paddingTop: insets.top + webTop + 8, borderBottomColor: colors.border, borderBottomWidth: tokens.border.panel }]}>
      <View accessible accessibilityLabel={`Setup progress: step ${f.step} of 5`} style={{ flexDirection: 'row', gap: 5 }}>{STEPS.map((_, i) => <View key={i} testID={`progress-step-${i + 1}`} style={{ height: 8, width: i + 1 === f.step ? 26 : 8, backgroundColor: i + 1 === f.step ? colors.gold : i + 1 < f.step ? colors.cyan : colors.border, borderRadius: tokens.radius.pill ? 4 : 0 }}/>)}</View>
      <Pressable testID="button-onboarding-skip" accessibilityRole="button" accessibilityLabel="Skip setup" accessibilityState={{ disabled: !!busy || done }} disabled={!!busy || done} onPress={() => void skip()} hitSlop={12}><Text style={{ color: colors.mutedForeground, fontWeight: '700', fontSize: 13, opacity: busy || done ? 0.4 : 1 }}>{busy === 'skip' ? 'Skipping…' : 'Skip setup (تخطي)'}</Text></Pressable>
    </View>

    <KeyboardAwareScrollViewCompat key={f.step} style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 160 + insets.bottom, gap: 16 }} keyboardShouldPersistTaps="handled" bottomOffset={130}>
      <Text style={[s.eyebrow, tokens.eyebrow, { color: colors.cyan }]}>Step {f.step} of 5 · <Text style={rtl}>{STEPS[f.step - 1].ar}</Text></Text>
      <Text accessibilityRole="header" style={[tokens.title, { color: colors.foreground }]}>{STEPS[f.step - 1].en}</Text>

      {stalled ? <View testID="status-onboarding-conflict" accessibilityLiveRegion="assertive" style={[s.banner, { borderColor: colors.gold, backgroundColor: colors.card, borderRadius: radius }]}>
        <Text style={{ color: colors.foreground, fontSize: 13 }}>{saveState === 'conflict' ? 'Your setup was changed on another device, so this edit was not saved.' : 'Your setup changed on another device while you were editing here.'}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><PixelButton testID="button-onboarding-reload-draft" label={busy === 'reload' ? 'Loading…' : 'Load saved setup'} disabled={busy === 'reload'} onPress={() => void reloadServer()}/></View>
          {external && saveState !== 'conflict' ? <View style={{ flex: 1 }}><PixelButton testID="button-onboarding-keep-mine" tone="quiet" label="Keep my edits" onPress={() => { revRef.current = revisionOf(live); setExternal(false); void save(f, safeStep(f), true); }}/></View> : null}
        </View>
      </View> : null}

      {f.step === 1 && <>
        <Panel><Text nativeID="label-username" style={[s.label, { color: colors.mutedForeground }]}>Hero name</Text>
          <TextInput testID="input-onboarding-username" accessibilityLabel="Hero name" accessibilityLabelledBy="label-username" accessibilityHint="3 to 20 letters, numbers or underscore" value={f.username} editable={!locked} maxLength={20} autoCapitalize="none" autoCorrect={false} returnKeyType="next" onSubmitEditing={() => void go(2)} onChangeText={(v) => set({ username: v })} placeholder="e.g. Layla_Ironleaf" placeholderTextColor={colors.mutedForeground} style={[s.input, input]}/>
          <Text style={[s.hint, { color: colors.mutedForeground }]}>3–20 letters, numbers or underscore. Must be unique.</Text></Panel>
        <Text style={{ color: colors.mutedForeground }}>Pick the world your hero lives in — tap to preview live. It's saved with your setup.</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="World theme" style={s.grid}>{THEME_IDS.map((t: ThemeId) => { const sel = f.themeId === t; return <Pressable key={t} testID={`card-theme-${t}`} accessibilityRole="radio" accessibilityLabel={`${THEMES[t].name}. ${THEMES[t].blurb}`} accessibilityState={{ checked: sel, disabled: locked }} disabled={locked} onPress={() => pickTheme(t)} style={[s.themeCard, card(sel)]}>
          <Image source={THEME_PREVIEW_IMAGES[t]} accessible={false} style={{ width: '100%', aspectRatio: 1.5, borderTopLeftRadius: radius, borderTopRightRadius: radius }}/>
          <View style={{ padding: 9, flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 13 }}>{THEMES[t].name}</Text><Text style={{ color: colors.mutedForeground, fontSize: 11 }} numberOfLines={1}>{THEMES[t].blurb}</Text></View>{sel ? <Feather name="check" size={16} color={colors.gold}/> : null}</View>
        </Pressable>; })}</View>
      </>}

      {f.step === 2 && <>
        <View accessibilityRole="radiogroup" accessibilityLabel="Hero path" style={{ gap: 12 }}>{PATHS.map((p) => { const sel = f.heroPath === p.id; return <Pressable key={p.id} testID={`card-path-${p.id}`} accessibilityRole="radio" accessibilityLabel={`${p.name}, ${p.ar}. ${p.focus}. Grows ${p.stat}`} accessibilityState={{ checked: sel, disabled: locked }} disabled={locked} onPress={() => pickPath(p.id)} style={[s.row, card(sel)]}>
          <View style={[s.badge, { backgroundColor: sel ? colors.gold : colors.secondary, borderRadius: Math.min(radius, 10) }]}><Text style={{ color: sel ? colors.background : colors.cyan, fontWeight: '800' }}>{p.id}</Text></View>
          <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 15 }}>{p.name} <Text style={rtl}>({p.ar})</Text></Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{p.focus} · grows {p.stat}</Text></View>
        </Pressable>; })}</View>
        <Panel><Text style={{ color: colors.foreground, fontSize: 13, marginBottom: 6 }}>{f.heroPath ? `Your first habit will train ${f.heroPath}. Points arrive only when you complete it.` : 'Choose a path to see which axis your habits will grow.'}</Text>
          <SkillRadar skills={snap.skills} highlight={f.heroPath}/></Panel>
      </>}

      {f.step === 3 && <>
        <Text style={{ color: colors.mutedForeground }}>One-tap presets for the {pathName ?? 'chosen path'}:</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {HABIT_PRESETS[(f.heroPath ?? 'STR') as HeroPath].map((h) => { const sel = f.habitPresetId === h.id; return <Pressable key={h.id} testID={`preset-habit-${h.id}`} accessibilityRole="button" accessibilityLabel={h.title} accessibilityState={{ selected: sel, disabled: locked }} disabled={locked} onPress={() => { set({ habitPresetId: h.id, habitTitle: h.title, habitTarget: String(h.target), habitUnit: h.unit }); tap(); }} style={chipStyle(sel)}><Text style={[rtl, { color: sel ? colors.background : colors.foreground, fontWeight: '700' }]}>{h.title}</Text></Pressable>; })}
          <Pressable testID="preset-habit-custom" accessibilityRole="button" accessibilityLabel="Write my own habit" accessibilityState={{ selected: f.habitPresetId === 'custom', disabled: locked }} disabled={locked} onPress={() => { set({ habitPresetId: 'custom', habitTitle: '', habitTarget: '1', habitUnit: '' }); tap(); }} style={[chipStyle(f.habitPresetId === 'custom', true), { flexDirection: 'row', alignItems: 'center', gap: 6 }]}><Feather name="edit-3" size={14} color={f.habitPresetId === 'custom' ? colors.background : colors.foreground}/><Text style={{ color: f.habitPresetId === 'custom' ? colors.background : colors.foreground, fontWeight: '700' }}>Write my own</Text></Pressable>
        </View>
        <Panel>
          <Text style={[s.label, { color: colors.mutedForeground }]}>Habit name</Text>
          <TextInput testID="input-onboarding-habit-title" accessibilityLabel="Habit name" value={f.habitTitle} editable={!locked} maxLength={120} onChangeText={(v) => set({ habitTitle: v, habitPresetId: f.habitPresetId ?? 'custom' })} placeholder="Walk after dinner" placeholderTextColor={colors.mutedForeground} style={[s.input, input, { writingDirection: 'auto' as const }]}/>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}><Text style={[s.label, { color: colors.mutedForeground }]}>Daily target</Text><TextInput testID="input-onboarding-habit-target" accessibilityLabel="Daily target" keyboardType="decimal-pad" value={f.habitTarget} editable={!locked} onChangeText={(v) => set({ habitTarget: v })} style={[s.input, input]}/></View>
            <View style={{ flex: 1 }}><Text style={[s.label, { color: colors.mutedForeground }]}>Unit</Text><TextInput testID="input-onboarding-habit-unit" accessibilityLabel="Unit" value={f.habitUnit} maxLength={30} editable={!locked} onChangeText={(v) => set({ habitUnit: v })} placeholder="minutes" placeholderTextColor={colors.mutedForeground} style={[s.input, input]}/></View>
          </View>
          <View style={[s.row, { marginTop: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.secondary, borderRadius: radius }]}>
            <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: '700' }}>Require Photo Proof (📸)</Text><Text style={[rtl, { color: colors.mutedForeground, fontSize: 12, marginTop: 3 }]}>يتطلب إثباتاً بالصورة للحصول على الـ XP</Text></View>
            <Switch testID="toggle-onboarding-photo-proof" accessibilityLabel="Require photo proof" value={f.requiresPhotoProof} disabled={locked} onValueChange={(v) => set({ requiresPhotoProof: v })} trackColor={{ true: colors.gold, false: colors.border }}/>
          </View>
          <Text style={[s.hint, { color: colors.mutedForeground }]}>Daily · trains {f.heroPath ?? '—'} · never auto-completed</Text>
        </Panel>
      </>}

      {f.step === 4 && <>
        <Text style={[rtl, { color: colors.foreground, fontSize: 15 }]}>ما المكافأة الواقعية التي تستحق أن تكافئ بها نفسك عند الالتزام؟</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="First real reward" style={{ gap: 12 }}>{REWARD_PRESETS.map((r) => { const sel = f.rewardPresetId === r.id; const gate = r.fixed ? `Locked until ${gateText(r.streak)}` : 'Level 2 — add a streak if you like'; return <Pressable key={r.id} testID={`preset-reward-${r.id}`} accessibilityRole="radio" accessibilityLabel={`${r.title}. ${gate}`} accessibilityState={{ checked: sel, disabled: locked }} disabled={locked} onPress={() => pickReward(r.id)} style={[s.row, card(sel)]}>
          <View style={{ flex: 1, gap: 4 }}><Text style={[rtl, { color: colors.foreground, fontWeight: '700', fontSize: 15 }]}>{r.title}</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{gate}</Text></View>
          <Feather name={sel ? 'check' : 'lock'} size={16} color={sel ? colors.gold : colors.mutedForeground}/>
        </Pressable>; })}</View>
        {f.rewardPresetId ? <Panel>
          <Text style={[s.label, { color: colors.mutedForeground }]}>Reward title</Text>
          <TextInput testID="input-onboarding-reward-title" accessibilityLabel="Reward title" value={f.rewardTitle} editable={!locked} maxLength={120} onChangeText={(v) => set({ rewardTitle: v })} placeholder="New headphones" placeholderTextColor={colors.mutedForeground} style={[s.input, input]}/>
          <Text style={[s.label, { color: colors.mutedForeground, marginTop: 10 }]}>Streak (days){itemGate ? ' · 0 = Level 2 only' : ' · fixed for this reward'}</Text>
          <TextInput testID="input-onboarding-reward-streak" accessibilityLabel={itemGate ? 'Streak days, 0 means Level 2 only' : 'Streak days, fixed for this reward'} keyboardType="number-pad" value={f.rewardStreak} editable={!locked && itemGate} onChangeText={(v) => set({ rewardStreak: v.replace(/[^\d]/g, '') })} style={[s.input, input, { opacity: itemGate ? 1 : 0.6 }]}/>
          <Text testID="text-onboarding-reward-gate" style={[s.hint, { color: colors.mutedForeground }]}>Unlocks at {gateText(f.rewardStreak || 0)}{Number(f.rewardStreak) > 0 ? ' on your first habit' : ''}. No gold cost.</Text>
        </Panel> : null}
      </>}

      {f.step === 5 && <>
        <Panel><View style={{ alignItems: 'center', gap: 8 }}>
          <PixelAvatar id={snap.profile.avatarId} size={120}/>
          <Text testID="text-onboarding-username" style={[tokens.section, { color: colors.foreground }]}>{f.username}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{pathName}</Text>
        </View></Panel>
        <View accessible style={[s.row, card(false)]}><Image source={THEME_PREVIEW_IMAGES[f.themeId]} accessible={false} style={{ width: 96, aspectRatio: 1.5, borderRadius: Math.min(radius, 8) }}/><View style={{ flex: 1 }}><Text style={[s.label, { color: colors.cyan }]}>WORLD</Text><Text style={{ color: colors.foreground, fontWeight: '700' }}>{THEMES[f.themeId].name}</Text></View></View>
        <View accessible testID="text-onboarding-habit" style={[s.row, card(false)]}><View style={{ flex: 1 }}><Text style={[s.label, { color: colors.cyan }]}>FIRST HABIT</Text><Text style={{ color: colors.foreground, fontWeight: '700', writingDirection: 'auto' as const }}>{f.habitTitle}</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{f.habitTarget} {f.habitUnit} daily · {f.heroPath}{f.requiresPhotoProof ? ' · photo proof' : ''}</Text></View></View>
        <View accessible testID="text-onboarding-reward" style={[s.row, card(false)]}><Feather name="lock" size={16} color={colors.gold}/><View style={{ flex: 1 }}><Text style={[s.label, { color: colors.cyan }]}>LOCKED REWARD</Text><Text style={{ color: colors.foreground, fontWeight: '700', writingDirection: 'auto' as const }}>{f.rewardTitle}</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{gateText(f.rewardStreak || 0)}</Text></View></View>
        <View accessible accessibilityLiveRegion="polite" testID="status-starter-xp" style={[s.row, { borderWidth: 2, borderStyle: 'dashed', borderColor: done ? colors.gold : colors.border, borderRadius: radius }]}>
          <Feather name="star" size={20} color={colors.gold}/>
          <View style={{ flex: 1 }}><Text style={[tokens.section, { color: colors.gold }]}>+{STARTER_XP} XP</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{done ? 'Confirmed by camp. Welcome!' : 'Pending — awarded once when camp confirms your setup. No gold or free skill points.'}</Text></View>
        </View>
      </>}
    </KeyboardAwareScrollViewCompat>

    {done && !reduce ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>{Array.from({ length: 22 }, (_, i) => <Animated.View key={i} style={{ position: 'absolute', left: `${(i * 37) % 95}%`, top: `${25 + ((i * 23) % 50)}%`, width: 9, height: 9, borderRadius: tokens.radius.pill ? 5 : 0, backgroundColor: [colors.gold, colors.cyan, colors.purple, colors.destructive][i % 4], opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, -60 - (i % 5) * 12] }) }] }}/>)}</View> : null}

    <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16), backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: tokens.border.panel }]}>
      {err ? <Text testID="status-onboarding-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.destructive, fontSize: 12, marginBottom: 8 }}>{err}</Text> : null}
      {saveState === 'failed' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Text testID="status-onboarding-save" style={{ color: colors.mutedForeground, fontSize: 11 }}>Draft not saved.</Text>
        <Pressable testID="button-onboarding-save-retry" accessibilityRole="button" accessibilityLabel="Retry saving draft" disabled={!!busy} hitSlop={10} onPress={() => void save(f, safeStep(f), true)}><Text style={{ color: colors.cyan, fontSize: 12, fontWeight: '700' }}>Retry</Text></Pressable>
      </View> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><PixelButton testID="button-onboarding-back" label={busy === 'back' ? 'Saving…' : 'Back'} tone="quiet" disabled={f.step === 1 || locked} onPress={() => void go(f.step - 1)}/></View>
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
  banner: { borderWidth: 2, padding: 14, gap: 10 },
  badge: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 11 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12 },
});
