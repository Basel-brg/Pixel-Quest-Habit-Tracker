import type { ReactNode } from 'react';
import { AlertTriangle, Shield, Sparkles, X } from 'lucide-react';
import { useRpg } from '@/lib/rpg-context';

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');
const colors = { gold: 'bg-[#f5ca62] text-[#252138] hover:bg-[#ffda7c]', quiet: 'bg-[#2a273b] text-[#ded8ed] border border-[#514967] hover:bg-[#373148]', cyan: 'bg-[#73e6df] text-[#19252b] hover:bg-[#9af3ed]', danger: 'bg-[#5a303b] text-[#ffb8aa] border border-[#854757] hover:bg-[#6e3847]' };
export function Btn({ children, onClick, variant = 'gold', className, disabled, testId, type = 'button', label }: { children: ReactNode; onClick?: () => void; variant?: keyof typeof colors; className?: string; disabled?: boolean; testId: string; type?: 'button' | 'submit'; label?: string }) {
  return <button type={type} aria-label={label} data-testid={testId} disabled={disabled} onClick={onClick} className={cx('pixel-button inline-flex items-center justify-center gap-2 border-2 border-black/20 px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40', colors[variant], className)}>{children}</button>;
}
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('pixel-border bg-[#211f33]/95 p-5 md:p-6', className)}>{children}</section>;
}
export function PageHead({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub?: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 font-mono text-[9px] uppercase tracking-[.2em] text-[#73e6df]">{eyebrow}</p><h1 className="pixel-title text-[15px] text-[#f3e9cf] md:text-[19px]">{title}</h1>{sub && <p className="mt-3 max-w-xl text-sm text-[#928ba4]">{sub}</p>}</div>{action}</div>;
}
export function SectionHead({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <div className="mb-4 flex items-end justify-between gap-3"><div>{eyebrow && <p className="mb-2 font-mono text-[9px] uppercase tracking-[.18em] text-[#8f89a5]">{eyebrow}</p>}<h2 className="pixel-title text-[11px] text-[#f3e9cf] md:text-[12px]">{title}</h2></div>{action}</div>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#b9b3c8]">{label}</span>{children}{hint && <span className="mt-1 block text-[11px] text-[#837c96]">{hint}</span>}</label>;
}
export function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0d0c16]/80 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={title} className={cx('pixel-border my-auto w-full bg-[#211f33] p-5 md:p-7', wide ? 'max-w-2xl' : 'max-w-lg')}>
      <div className="mb-5 flex items-start justify-between gap-3"><h2 className="pixel-title text-[11px] text-[#f3e9cf]">{title}</h2><button type="button" data-testid="button-close-modal" aria-label="Close" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center border border-[#514967] text-[#aaa4bb] hover:text-[#f5ca62]"><X size={16}/></button></div><div className="mb-4 empty:hidden"><ServerError/></div>{children}</div></div>;
}
export function Empty({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="border border-dashed border-[#514967] bg-[#1c1a2b] px-5 py-8 text-center"><div className="mx-auto mb-3 grid h-10 w-10 place-items-center border border-[#514967] text-[#73e6df]"><Sparkles size={18}/></div><p className="pixel-title text-[9px] text-[#e8dfcb]">{title}</p><p className="mx-auto mt-3 max-w-xs text-sm text-[#928ba4]">{detail}</p>{action && <div className="mt-5">{action}</div>}</div>;
}
export function Skeleton() {
  return <div className="space-y-4" aria-label="Loading"><div className="h-32 animate-pulse border-2 border-[#39354e] bg-[#211f33]"/><div className="grid gap-4 md:grid-cols-2"><div className="h-48 animate-pulse border-2 border-[#39354e] bg-[#211f33]"/><div className="h-48 animate-pulse border-2 border-[#39354e] bg-[#211f33]"/></div></div>;
}
/** Renders loading/error states until the snapshot exists. */
export function Gate({ children }: { children: (s: NonNullable<ReturnType<typeof useRpg>['snap']>) => ReactNode }) {
  const r = useRpg();
  if (r.snap) return <>{children(r.snap)}</>;
  if (r.isError) return <Panel className="text-center"><Shield className="mx-auto mb-3 text-[#f5ca62]"/><p className="mb-4 text-sm text-[#b9b3c8]">The journal could not sync just now.</p><Btn testId="button-retry" onClick={r.refetch}>Try again</Btn></Panel>;
  return <Skeleton/>;
}
export function ServerError() {
  const { error, clearError } = useRpg();
  if (!error) return null;
  return <div role="alert" data-testid="status-server-error" className="flex items-start gap-3 border border-[#854757] bg-[#3a2631] px-4 py-3 text-xs text-[#ffb8aa]"><AlertTriangle size={15} className="mt-0.5 shrink-0"/><span className="flex-1">{error}</span><button type="button" data-testid="button-dismiss-error" onClick={clearError} aria-label="Dismiss" className="shrink-0"><X size={14}/></button></div>;
}
export function Meter({ value, max, color = '#73e6df', label }: { value: number; max: number; color?: string; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} className="h-3 border border-[#524b63] bg-[#161522] p-[2px]"><div className="xp-fill h-full" style={{ width: `${pct}%`, background: color }}/></div>;
}
export const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
