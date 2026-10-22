import { Link } from 'wouter';
import { Activity, Gift, Gamepad2, Swords } from 'lucide-react';

export default function Landing() {
  const feats = [{ i: Activity, t: 'Habit streaks', d: 'Daily rituals earn XP and Gold.' }, { i: Swords, t: 'Quest board', d: 'Turn tasks into winnable quests.' }, { i: Gift, t: 'Reward shop', d: 'Unlock real treats you chose yourself.' }];
  return <div className="scanlines min-h-[100dvh] px-4 py-8 text-[color:var(--pq-ink)]"><div className="mx-auto max-w-4xl">
    <header className="flex items-center justify-between"><div className="flex items-center gap-3"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-10 w-10 border-2 border-[color:var(--pq-gold)]"/><b className="pixel-title text-[10px] text-[color:var(--pq-gold)]">PIXEL QUEST</b></div>
      <Link href="/sign-in" data-testid="link-landing-sign-in" className="border border-[color:var(--pq-line)] px-4 py-2 text-sm font-bold text-[color:var(--pq-ink)] no-underline hover:bg-[color:var(--pq-line3)]">Sign in</Link></header>
    <section className="pixel-border mt-14 bg-[color:var(--pq-panel)]/95 p-6 md:p-12"><p className="mb-4 font-mono text-[9px] uppercase tracking-[.2em] text-[color:var(--pq-cyan)]">Press start</p>
      <h1 className="pixel-title text-[18px] leading-loose text-[color:var(--pq-ink)] md:text-[28px]">Small wins level up your life.</h1>
      <p className="mt-5 max-w-lg text-sm leading-relaxed text-[color:var(--pq-mute2)]">Build habits, clear quests, earn Gold, evolve your hero and cash in on rewards you actually want.</p>
      <div className="mt-8 flex flex-wrap gap-3"><Link href="/sign-up" data-testid="link-landing-sign-up" className="pixel-button inline-flex items-center gap-2 border-2 border-black/20 bg-[color:var(--pq-gold)] px-5 py-3 text-sm font-bold text-[color:var(--pq-onaccent)] no-underline"><Gamepad2 size={16}/> Start your quest</Link>
        <Link href="/sign-in" data-testid="link-landing-continue" className="inline-flex items-center border border-[color:var(--pq-line)] px-5 py-3 text-sm font-bold text-[color:var(--pq-ink)] no-underline hover:bg-[color:var(--pq-line3)]">Continue save</Link></div></section>
    <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr_.9fr_1fr]">{feats.map(({ i: Icon, t, d }) => <div key={t} className="border border-[color:var(--pq-line2)] bg-[color:var(--pq-panel2)] p-5"><Icon size={20} className="mb-3 text-[color:var(--pq-cyan)]"/><h2 className="text-sm font-bold">{t}</h2><p className="mt-2 text-xs text-[color:var(--pq-mute)]">{d}</p></div>)}</div>
  </div></div>;
}
