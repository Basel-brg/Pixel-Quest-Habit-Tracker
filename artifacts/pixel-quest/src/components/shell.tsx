import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useClerk } from '@clerk/react';
import { Activity, BookOpen, ChevronRight, Gamepad2, Gift, LogOut, Package, ScrollText, Swords, UserRound, Volume2, VolumeX, Waves } from 'lucide-react';
import { cx, ServerError } from '@/components/kit';
import { setPref, usePrefs } from '@/lib/feedback';
import { useRpg } from '@/lib/rpg-context';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const nav = [
  { href: '/camp', label: 'Camp', short: 'Camp', icon: Gamepad2 }, { href: '/habits', label: 'Habits', short: 'Habits', icon: Activity },
  { href: '/quests', label: 'Quest board', short: 'Quests', icon: Swords }, { href: '/inventory', label: 'Inventory', short: 'Pack', icon: Package },
  { href: '/rewards', label: 'Reward shop', short: 'Rewards', icon: Gift }, { href: '/journal', label: 'Journal', short: 'Journal', icon: BookOpen },
  { href: '/profile', label: 'Profile', short: 'Hero', icon: UserRound },
];
export function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation(); const { signOut } = useClerk(); const prefs = usePrefs(); const { snap, notice } = useRpg();
  const out = () => void signOut({ redirectUrl: basePath || '/' });
  const slug = (s: string) => s.toLowerCase().replaceAll(' ', '-');
  return <div className={cx('min-h-[100dvh] text-[#eee8da]', prefs.scanlines && 'scanlines')}>
    <div className="mx-auto flex min-h-[100dvh] max-w-[1440px]">
      <aside className="hidden w-[248px] shrink-0 border-r border-[#39354e] bg-[#171625]/75 px-5 py-7 md:flex md:flex-col">
        <Link href="/camp" className="mb-10 flex items-center gap-3 text-inherit no-underline" data-testid="link-brand"><span className="grid h-11 w-11 place-items-center border-2 border-[#f5ca62] bg-[#302b46] text-[#f5ca62] shadow-[3px_3px_0_#0e0d18]"><Gamepad2 size={23}/></span><span><b className="pixel-title block text-[10px] text-[#f5ca62]">PIXEL QUEST</b><small className="mt-2 block text-xs text-[#8f89a5]">your life, leveled up</small></span></Link>
        <p className="mb-3 px-2 font-mono text-[9px] uppercase tracking-[.2em] text-[#77718d]">Your journal</p>
        <nav className="space-y-1.5">{nav.map(({ href, label, icon: Icon }) => <Link href={href} key={href} data-testid={`link-nav-${slug(label)}`} className={cx('flex items-center gap-3 border-2 px-3 py-2.5 text-sm font-semibold no-underline transition-colors', path === href ? 'border-[#f5ca62]/55 bg-[#2c293d] text-[#f5ca62]' : 'border-transparent text-[#aca6bd] hover:bg-[#242236] hover:text-[#eee8da]')}><Icon size={17}/>{label}{path === href && <ChevronRight size={15} className="ml-auto"/>}</Link>)}</nav>
        <div className="mt-auto space-y-2 border-t border-[#39354e] pt-5">
          <button data-testid="button-toggle-audio" onClick={() => setPref('muted', !prefs.muted)} className="flex w-full items-center gap-3 border border-[#39354e] px-3 py-2.5 text-left text-sm text-[#b9b3c8] hover:bg-[#242236]">{prefs.muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}Sound<span className="ml-auto text-[10px] text-[#7f7995]">{prefs.muted ? 'OFF' : 'ON'}</span></button>
          <button data-testid="button-toggle-scanlines" onClick={() => setPref('scanlines', !prefs.scanlines)} className="flex w-full items-center gap-3 border border-[#39354e] px-3 py-2.5 text-left text-sm text-[#b9b3c8] hover:bg-[#242236]"><Waves size={17}/>Scanlines<span className="ml-auto text-[10px] text-[#7f7995]">{prefs.scanlines ? 'ON' : 'OFF'}</span></button>
          <button data-testid="button-logout" onClick={out} className="flex w-full items-center gap-3 border border-[#39354e] px-3 py-2.5 text-left text-sm text-[#b9b3c8] hover:bg-[#242236]"><LogOut size={17}/>Log out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 pb-24 md:pb-8">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#39354e] bg-[#1b1930]/95 px-4 py-3 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-3 md:hidden"><Gamepad2 size={22} className="text-[#f5ca62]"/><span className="pixel-title text-[9px] text-[#f5ca62]">PIXEL QUEST</span></div>
          <p className="hidden text-xs text-[#8d87a3] md:block">PLAYER JOURNAL <span className="mx-2 text-[#4d4861]">/</span> {path.slice(1).toUpperCase()}</p>
          <div className="flex items-center gap-3">{snap && <span data-testid="text-today" className="hidden text-xs text-[#aaa4bb] sm:block">{snap.today} · {snap.timezone}</span>}
            <button data-testid="button-toggle-scanlines-mobile" onClick={() => setPref('scanlines', !prefs.scanlines)} aria-label="Toggle scanlines" aria-pressed={prefs.scanlines} className="grid h-9 w-9 place-items-center border border-[#454058] text-[#aaa4bb] md:hidden"><Waves size={17}/></button>
            <button data-testid="button-toggle-audio-mobile" onClick={() => setPref('muted', !prefs.muted)} aria-label={prefs.muted ? 'Turn sound on' : 'Mute sound'} className="grid h-9 w-9 place-items-center border border-[#454058] text-[#aaa4bb] md:hidden">{prefs.muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button>
            <button data-testid="button-logout-mobile" onClick={out} aria-label="Log out" className="grid h-9 w-9 place-items-center border border-[#454058] text-[#aaa4bb] md:hidden"><LogOut size={17}/></button></div>
        </header>
        <div className="mx-auto max-w-[1160px] space-y-5 px-4 py-7 md:px-8 md:py-9">
          <ServerError/>
          {notice && <div role="status" data-testid="status-notice" className="flex items-center gap-2 border border-[#537872] bg-[#1f3236] px-4 py-3 text-xs text-[#9cf4ed]"><ScrollText size={14}/>{notice}</div>}
          {children}</div>
      </main>
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-[#48435d] bg-[#171625]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">{nav.map(({ href, short, label, icon: Icon }) => <Link href={href} key={href} data-testid={`mobile-nav-${slug(label)}`} className={cx('flex flex-col items-center gap-1 py-2.5 text-[8px] font-semibold no-underline', path === href ? 'text-[#f5ca62]' : 'text-[#938da6]')}><Icon size={18}/>{short}</Link>)}</nav>
  </div>;
}
