import { Link } from 'wouter';
import { Activity, Gift, Gamepad2, Swords } from 'lucide-react';

export default function Landing() {
  const feats = [{ i: Activity, t: 'Habit streaks', d: 'Daily rituals earn XP and Gold.' }, { i: Swords, t: 'Quest board', d: 'Turn tasks into winnable quests.' }, { i: Gift, t: 'Reward shop', d: 'Unlock real treats you chose yourself.' }];
  return <div className="scanlines min-h-[100dvh] px-4 py-8 text-[#eee8da]"><div className="mx-auto max-w-4xl">
    <header className="flex items-center justify-between"><div className="flex items-center gap-3"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-10 w-10 border-2 border-[#f5ca62]"/><b className="pixel-title text-[10px] text-[#f5ca62]">PIXEL QUEST</b></div>
      <Link href="/sign-in" data-testid="link-landing-sign-in" className="border border-[#514967] px-4 py-2 text-sm font-bold text-[#ded8ed] no-underline hover:bg-[#2a273b]">Sign in</Link></header>
    <section className="pixel-border mt-14 bg-[#211f33]/95 p-6 md:p-12"><p className="mb-4 font-mono text-[9px] uppercase tracking-[.2em] text-[#73e6df]">Press start</p>
      <h1 className="pixel-title text-[18px] leading-loose text-[#f3e9cf] md:text-[28px]">Small wins level up your life.</h1>
      <p className="mt-5 max-w-lg text-sm leading-relaxed text-[#aaa4bb]">Build habits, clear quests, earn Gold, evolve your hero and cash in on rewards you actually want.</p>
      <div className="mt-8 flex flex-wrap gap-3"><Link href="/sign-up" data-testid="link-landing-sign-up" className="pixel-button inline-flex items-center gap-2 border-2 border-black/20 bg-[#f5ca62] px-5 py-3 text-sm font-bold text-[#252138] no-underline"><Gamepad2 size={16}/> Start your quest</Link>
        <Link href="/sign-in" data-testid="link-landing-continue" className="inline-flex items-center border border-[#514967] px-5 py-3 text-sm font-bold text-[#ded8ed] no-underline hover:bg-[#2a273b]">Continue save</Link></div></section>
    <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr_.9fr_1fr]">{feats.map(({ i: Icon, t, d }) => <div key={t} className="border border-[#49445d] bg-[#1c1a2b] p-5"><Icon size={20} className="mb-3 text-[#73e6df]"/><h2 className="text-sm font-bold">{t}</h2><p className="mt-2 text-xs text-[#928ba4]">{d}</p></div>)}</div>
  </div></div>;
}
