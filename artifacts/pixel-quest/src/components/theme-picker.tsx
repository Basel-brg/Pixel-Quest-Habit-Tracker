import { Check, RotateCcw } from 'lucide-react';
import { THEME_IDS, THEME_META, useTheme } from '@/lib/theme';

export function ThemePicker() {
  const { theme, saving, error, setTheme, retry, dismissError } = useTheme();
  return <div data-testid="theme-picker">
    <div role="radiogroup" aria-label="Visual theme" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {THEME_IDS.map((id) => { const m = THEME_META[id]; const on = theme === id;
        return <button key={id} type="button" role="radio" aria-checked={on} data-testid={`button-theme-${id}`} onClick={() => setTheme(id)}
          className={`group text-left transition-transform disabled:opacity-60 ${on ? '-translate-y-0.5' : ''}`}>
          <span className="block overflow-hidden p-2.5" style={{ background: m.bg, border: `2px solid ${on ? m.a : m.ink + '55'}`, borderRadius: m.radius, boxShadow: on ? `0 0 0 2px ${m.a}55` : 'none' }}>
            <span className="block p-2" style={{ background: m.panel, border: `1px solid ${m.ink}33`, borderRadius: Math.min(m.radius, 10) }}>
              <span className="block truncate text-[10px] font-bold" style={{ color: m.ink, fontFamily: m.font }}>Quest log</span>
              <span className="mt-1.5 block h-1.5 w-full" style={{ background: m.ink + '26', borderRadius: m.radius ? 99 : 0 }}><span className="block h-full w-2/3" style={{ background: m.a, borderRadius: m.radius ? 99 : 0 }}/></span>
              <span className="mt-2 flex gap-1.5"><i className="block h-3 w-8" style={{ background: m.a, borderRadius: m.radius ? 99 : 0 }}/><i className="block h-3 w-5" style={{ background: m.b, borderRadius: m.radius ? 99 : 0 }}/></span>
            </span>
          </span>
          <span className="mt-2 flex items-center gap-1.5 text-xs font-bold text-[color:var(--pq-ink)]">{on && <Check size={13} className="text-[color:var(--pq-gold)]"/>}{m.name}</span>
          <span className="block text-[11px] text-[color:var(--pq-mute)]">{m.blurb}</span>
        </button>; })}
    </div>
    <p aria-live="polite" className="mt-3 text-[11px] text-[color:var(--pq-mute)]">{saving ? 'Applied instantly · syncing your latest choice...' : error ? 'Not confirmed — retry to sync.' : 'Synced to your account across web and mobile.'}</p>
    {error && <div role="alert" data-testid="status-theme-error" className="mt-2 flex items-start gap-3 border border-[color:var(--pq-danger)] bg-[color:var(--pq-panel2)] px-3 py-2 text-xs text-[color:var(--pq-danger)]"><span className="flex-1">{error}</span>
      <button type="button" data-testid="button-theme-retry" onClick={retry} disabled={saving} className="flex items-center gap-1 font-bold underline"><RotateCcw size={12}/>Retry</button>
      <button type="button" onClick={dismissError} className="font-bold" aria-label="Dismiss">x</button></div>}
  </div>;
}
