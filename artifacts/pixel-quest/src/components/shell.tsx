import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, BookOpen, ChevronRight, Gamepad2, Gift, MoreHorizontal, Package, ScrollText, Settings, Swords, UserRound } from 'lucide-react';
import { cx, ServerError } from '@/components/kit';
import { usePrefs } from '@/lib/feedback';
import { useRpg } from '@/lib/rpg-context';

const nav = [
  { href: '/camp', label: 'Camp', short: 'Camp', icon: Gamepad2 }, { href: '/habits', label: 'Habits', short: 'Habits', icon: Activity },
  { href: '/quests', label: 'Quest board', short: 'Quests', icon: Swords }, { href: '/inventory', label: 'Inventory', short: 'Pack', icon: Package },
  { href: '/rewards', label: 'Reward shop', short: 'Rewards', icon: Gift }, { href: '/journal', label: 'Journal', short: 'Journal', icon: BookOpen },
  { href: '/profile', label: 'Profile', short: 'Hero', icon: UserRound },
  { href: '/settings', label: 'Settings', short: 'Settings', icon: Settings },
];
export function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation(); const prefs = usePrefs(); const { snap, notice } = useRpg();
  const slug = (s: string) => s.toLowerCase().replaceAll(' ', '-');
  return <div className={cx('min-h-[100dvh] text-[color:var(--pq-ink)]', prefs.scanlines && 'scanlines')}>
    <div className="mx-auto flex min-h-[100dvh] max-w-[1440px]">
      <aside className="hidden w-[248px] shrink-0 border-r border-[color:var(--pq-line3)] bg-[color:var(--pq-panel2)]/75 px-5 py-7 md:flex md:flex-col">
        <Link href="/camp" className="mb-10 flex items-center gap-3 text-inherit no-underline" data-testid="link-brand"><span className="grid h-11 w-11 place-items-center border-2 border-[color:var(--pq-gold)] bg-[color:var(--pq-line2)] text-[color:var(--pq-gold)] shadow-[3px_3px_0_var(--pq-shadow)]"><Gamepad2 size={23}/></span><span><b className="pixel-title block text-[10px] text-[color:var(--pq-gold)]">PIXEL QUEST</b><small className="mt-2 block text-xs text-[color:var(--pq-mute)]">your life, leveled up</small></span></Link>
        <p className="mb-3 px-2 font-mono text-[9px] uppercase tracking-[.2em] text-[color:var(--pq-mute)]">Your journal</p>
        <nav className="space-y-1.5">{nav.map(({ href, label, icon: Icon }) => <Link href={href} key={href} data-testid={`link-nav-${slug(label)}`} className={cx('flex items-center gap-3 border-2 px-3 py-2.5 text-sm font-semibold no-underline transition-colors', path === href ? 'border-[color:var(--pq-gold)]/55 bg-[color:var(--pq-line3)] text-[color:var(--pq-gold)]' : 'border-transparent text-[color:var(--pq-mute)] hover:bg-[color:var(--pq-panel2)] hover:text-[color:var(--pq-ink)]')}><Icon size={17}/>{label}{path === href && <ChevronRight size={15} className="ml-auto"/>}</Link>)}</nav>
      </aside>
      <main className="min-w-0 flex-1 pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] md:pb-8">
        <header className="sticky top-0 z-20 hidden items-center justify-between border-b border-[color:var(--pq-line3)] bg-[color:var(--pq-bg)]/95 px-8 py-3 backdrop-blur-md md:flex">
          <p className="hidden text-xs text-[color:var(--pq-mute)] md:block">PLAYER JOURNAL <span className="mx-2 text-[color:var(--pq-mute)]">/</span> {path.slice(1).toUpperCase()}</p>
          {snap && <span data-testid="text-today" className="text-xs text-[color:var(--pq-mute2)]">{snap.today} · {snap.timezone}</span>}
        </header>
        <div className="mx-auto max-w-[1160px] space-y-5 px-4 py-7 md:px-8 md:py-9">
          <ServerError/>
          {notice && <div role="status" data-testid="status-notice" className="flex items-center gap-2 border border-[color:var(--pq-mute)] bg-[color:var(--pq-panel2)] px-4 py-3 text-xs text-[color:var(--pq-cyan)]"><ScrollText size={14}/>{notice}</div>}
          {children}</div>
      </main>
    </div>
    <MobileNav path={path} slug={slug}/>
  </div>;
}

const primary = ['/camp', '/habits', '/quests', '/rewards'];
const moreItems = ['/inventory', '/journal', '/profile', '/settings'];
function MobileNav({ path, slug }: { path: string; slug: (s: string) => string }) {
  const [open, setOpen] = useState(false);
  const moreBtn = useRef<HTMLButtonElement>(null); const sheet = useRef<HTMLDivElement>(null);
  const moreActive = moreItems.includes(path);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const first = sheet.current?.querySelector<HTMLElement>('a'); first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); moreBtn.current?.focus(); }
      if (e.key === 'Tab' && sheet.current) {
        const f = [...sheet.current.querySelectorAll<HTMLElement>('a,button')]; if (!f.length) return;
        const a = document.activeElement; const last = f[f.length - 1]; const head = f[0];
        if (e.shiftKey && (a === head || a === moreBtn.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && a === last) { e.preventDefault(); head.focus(); }
      }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [open]);
  const tab = (active: boolean) => cx('relative flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold leading-none no-underline transition-colors', active ? 'text-[color:var(--pq-gold)]' : 'text-[color:var(--pq-mute)]');
  const bar = (active: boolean) => active && <span aria-hidden className="absolute inset-x-3 top-0 h-[3px] bg-[color:var(--pq-gold)] shadow-[0_0_10px_var(--pq-gold)]"/>;
  return <>
    {open && <div className="fixed inset-0 z-30 bg-[color:var(--pq-bg)]/60 backdrop-blur-[2px] md:hidden" data-testid="more-backdrop" onMouseDown={() => setOpen(false)} onTouchStart={() => setOpen(false)}/>}
    {open && <div ref={sheet} id="more-sheet" role="dialog" aria-label="More destinations" data-testid="more-sheet" className="more-sheet fixed inset-x-0 z-40 max-h-[calc(100dvh-5rem-env(safe-area-inset-top,0px))] overflow-y-auto border-t-2 border-[color:var(--pq-line)] bg-[color:var(--pq-panel)]/95 p-3 pb-2 backdrop-blur-md md:hidden" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}>
      <p className="px-2 pb-2 font-mono text-[9px] uppercase tracking-[.2em] text-[color:var(--pq-mute)]">More</p>
      <div className="grid gap-2">{nav.filter((n) => moreItems.includes(n.href)).map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`mobile-more-${slug(label)}`} aria-current={path === href ? 'page' : undefined} className={cx('flex min-h-[56px] items-center gap-3 border-2 px-4 text-sm font-semibold no-underline', path === href ? 'border-[color:var(--pq-gold)] bg-[color:var(--pq-line3)] text-[color:var(--pq-gold)]' : 'border-[color:var(--pq-line3)] bg-[color:var(--pq-panel2)] text-[color:var(--pq-ink)]')}><Icon size={20}/>{label}{path === href && <ChevronRight size={16} className="ml-auto"/>}</Link>)}</div>
    </div>}
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-[color:var(--pq-line)] bg-[color:var(--pq-panel2)]/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md md:hidden">
      {nav.filter((n) => primary.includes(n.href)).map(({ href, short, label, icon: Icon }) => <Link href={href} key={href} data-testid={`mobile-nav-${slug(label)}`} aria-current={path === href ? 'page' : undefined} className={tab(path === href)}>{bar(path === href)}<Icon size={21}/>{short}</Link>)}
      <button ref={moreBtn} type="button" data-testid="mobile-nav-more" aria-expanded={open} aria-controls="more-sheet" aria-haspopup="dialog" onClick={() => setOpen((v) => !v)} className={cx(tab(moreActive || open), 'bg-transparent')}>{bar(moreActive || open)}<MoreHorizontal size={21}/>More</button>
    </nav>
  </>;
}
