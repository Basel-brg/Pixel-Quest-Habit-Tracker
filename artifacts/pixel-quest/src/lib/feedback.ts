import { useSyncExternalStore } from 'react';

type Prefs = { muted: boolean; scanlines: boolean };
const read = (): Prefs => ({ muted: localStorage.getItem('pixelquest-muted') === 'true', scanlines: localStorage.getItem('pq:scanlines') !== 'off' });
let cache = read();
const subs = new Set<() => void>();
export function setPref(key: keyof Prefs, value: boolean) {
  if (key === 'muted') localStorage.setItem('pixelquest-muted', String(value));
  else localStorage.setItem('pq:scanlines', value ? 'on' : 'off');
  cache = read();
  subs.forEach((fn) => fn());
}
export function usePrefs(): Prefs {
  return useSyncExternalStore((fn) => { subs.add(fn); return () => { subs.delete(fn); }; }, () => cache);
}
export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export type CueKind = 'complete' | 'boss' | 'reward';
const tones: Record<CueKind, number[]> = { complete: [660, 880], boss: [220, 165, 220, 330, 440], reward: [523, 659, 784, 1047] };
const buzz: Record<CueKind, number[]> = { complete: [30], boss: [60, 40, 90], reward: [40, 30, 40, 30, 120] };
let ctx: AudioContext | null = null;
export function cue(kind: CueKind) {
  try { if (!reducedMotion() && 'vibrate' in navigator) navigator.vibrate(buzz[kind]); } catch { /* best effort */ }
  if (cache.muted) return;
  try {
    ctx = ctx ?? new window.AudioContext();
    const c = ctx; void c.resume();
    const step = kind === 'boss' ? 0.11 : 0.08;
    tones[kind].forEach((f, i) => {
      const o = c.createOscillator(); const g = c.createGain(); const t = c.currentTime + i * step;
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.03, t); g.gain.exponentialRampToValueAtTime(0.001, t + step * 1.6);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + step * 1.7);
    });
  } catch { /* audio is optional */ }
}
