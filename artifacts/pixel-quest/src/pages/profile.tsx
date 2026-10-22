import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Check, CircleDollarSign, Flame, LockKeyhole, Pencil, Shield, Swords, Trophy } from 'lucide-react';
import { Form } from '@/components/ui/form';
import { PixelAvatar } from '@/components/pixel-avatar';
import { Btn, Field, Gate, Modal, PageHead, Panel, SectionHead, cx } from '@/components/kit';
import { setPref, usePrefs } from '@/lib/feedback';
import { useReminders } from '@/lib/reminders';
import { useRpg } from '@/lib/rpg-context';

function zones(current: string): string[] {
  const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  const list = fn ? fn('timeZone') : ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Tokyo', 'Australia/Sydney'];
  return list.includes(current) ? list : [current, ...list];
}

export default function ProfilePage() {
  const { run, isPending, clearError } = useRpg();
  const prefs = usePrefs(); const rem = useReminders();
  const [editingName, setEditingName] = useState(false); const [picker, setPicker] = useState(false); const [tz, setTz] = useState('');
  const form = useForm<{ username: string }>({ defaultValues: { username: '' } });
  return <Gate>{(s) => {
    const p = s.profile; const current = p.avatars.find((a) => a.id === p.avatarId);
    const stats = [{ k: 'Level', v: p.level, i: Shield }, { k: 'Lifetime XP', v: p.xp, i: Swords }, { k: 'Gold', v: p.gold, i: CircleDollarSign }, { k: 'Quests vanquished', v: p.lifetimeTasksVanquished, i: Trophy }, { k: 'Best streak', v: `${p.highestHabitStreak}d`, i: Flame }];
    const submit = form.handleSubmit(async (v) => { clearError(); const r = await run({ action: 'profile', username: v.username.trim() }, { key: 'profile:name' }); if (r) setEditingName(false); });
    const tzValue = tz || s.timezone;
    const toggle = (testId: string, label: string, on: boolean, onChange: (v: boolean) => void, hint?: string) => <label className="flex items-start gap-3 border border-[#49445d] bg-[#1c1a2b] p-3 text-sm"><input type="checkbox" data-testid={testId} checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-[#f5ca62]"/><span>{label}{hint && <span className="block text-[11px] text-[#837c96]">{hint}</span>}</span></label>;
    return <>
      <PageHead eyebrow="Hero sheet" title="Your profile"/>
      <section className="pixel-border flex flex-col gap-6 bg-[#211f33]/95 p-5 sm:flex-row sm:items-center md:p-6">
        <button data-testid="button-open-avatar-picker" onClick={() => { clearError(); setPicker(true); }} aria-label="Change avatar" className="relative w-fit border-2 border-[#f5ca62] shadow-[4px_4px_0_#0e0d18]"><PixelAvatar id={p.avatarId} size={120} testId="img-current-avatar"/><span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center bg-[#f5ca62] text-[#252138]"><Pencil size={12}/></span></button>
        <div className="min-w-0 flex-1"><p className="font-mono text-[9px] uppercase tracking-wider text-[#a9a1b8]">{current?.name} · {current?.role}</p>
          {editingName ? <Form {...form}><form onSubmit={(e) => void submit(e)} className="mt-3 max-w-sm"><input autoFocus data-testid="input-username" className="field" {...form.register('username', { required: 'Username is required.', pattern: { value: /^[A-Za-z0-9_]{3,20}$/, message: 'Use 3-20 letters, numbers or underscores.' } })}/>
            {form.formState.errors.username && <p data-testid="error-username" className="mt-1 text-xs text-[#f29b83]">{form.formState.errors.username.message}</p>}
            <div className="mt-3 flex gap-2"><Btn testId="button-save-username" type="submit" className="!py-2 text-xs" disabled={isPending('profile:name')}>{isPending('profile:name') ? 'Saving...' : 'Save'}</Btn><Btn testId="button-cancel-username" variant="quiet" className="!py-2 text-xs" onClick={() => setEditingName(false)}>Cancel</Btn></div></form></Form>
            : <div className="mt-2 flex items-center gap-3"><h2 data-testid="text-username" className="pixel-title text-[13px] text-[#f4e7c5]">{p.username}</h2><button data-testid="button-edit-username" onClick={() => { form.reset({ username: p.username }); clearError(); setEditingName(true); }} className="grid h-8 w-8 place-items-center border border-[#514967] text-[#aaa4bb] hover:text-[#f5ca62]" aria-label="Edit username"><Pencil size={14}/></button></div>}
          <p className="mt-3 max-w-md text-xs text-[#928ba4]">{current?.description}</p></div></section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{stats.map(({ k, v, i: Icon }) => <div key={k} data-testid={`stat-${k.toLowerCase().replaceAll(' ', '-')}`} className="border border-[#49445d] bg-[#1c1a2b] p-4"><Icon size={16} className="mb-2 text-[#73e6df]"/><p className="font-mono text-sm text-[#f5ca62]">{v}</p><p className="mt-2 text-[11px] text-[#928ba4]">{k}</p></div>)}</div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel><SectionHead title="Habit streaks"/>{p.habitStreaks.length ? p.habitStreaks.map((h) => <div key={h.habitId} data-testid={`streak-${h.habitId}`} className="flex items-center gap-3 border-b border-[#39354e] py-3 last:border-0"><Flame size={16} className="text-[#f5a55a]"/><span className="min-w-0 flex-1 truncate text-sm font-semibold">{h.habitTitle}</span><span className="text-[11px] text-[#928ba4]">now {h.currentStreak}d</span><span className="font-mono text-[10px] text-[#f5ca62]">best {h.highestStreak}d</span></div>) : <p data-testid="empty-streaks" className="text-sm text-[#928ba4]">No habit streaks yet. Complete a habit to start one.</p>}</Panel>
        <Panel><SectionHead title="Milestones"/>{p.milestones.length ? <ol className="border-l-2 border-[#514967] pl-5">{p.milestones.map((m) => <li key={m.id} data-testid={`milestone-${m.id}`} className="relative pb-5 last:pb-0"><span className="absolute -left-[27px] top-1 h-3 w-3 border-2 border-[#f5ca62] bg-[#211f33]"/><p className="text-sm font-bold">{m.title}</p><p className="mt-1 text-xs text-[#928ba4]">{m.description}</p><p className="mt-1 font-mono text-[8px] text-[#73e6df]">{new Date(m.achievedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p></li>)}</ol> : <p data-testid="empty-milestones" className="text-sm text-[#928ba4]">Milestones will appear as you play.</p>}</Panel></div>
      <Panel><SectionHead eyebrow="SETTINGS" title="Preferences"/>
        <div className="grid gap-4 md:grid-cols-2">
          <div><Field label="Timezone" hint="Days settle in this zone. After first setup it can change once every 7 days."><select data-testid="select-timezone" value={tzValue} onChange={(e) => setTz(e.target.value)} className="field">{zones(s.timezone).map((z) => <option key={z} value={z}>{z}</option>)}</select></Field>
            <Btn testId="button-save-timezone" variant="quiet" className="mt-2 text-xs" disabled={tzValue === s.timezone || isPending('settings:')} onClick={() => void run({ action: 'settings', timezone: tzValue }).then((r) => { if (r) setTz(''); })}>Save timezone</Btn></div>
          <div className="space-y-2">
            {toggle('checkbox-chest', 'Daily chest', s.chest.enabled, (v) => void run({ action: 'settings', chestEnabled: v }), 'Optional bonus after all scheduled habits. Gold 10 50%, Coffee break 30%, Movie time 20%.')}
            {toggle('checkbox-sound', 'Sound cues', !prefs.muted, (v) => setPref('muted', !v), 'Square-wave tones plus a short vibration where supported.')}
            {toggle('checkbox-scanlines', 'Scanline overlay', prefs.scanlines, (v) => setPref('scanlines', v))}</div></div>
        <div className="mt-5 border-t border-[#39354e] pt-5"><h3 className="mb-2 text-sm font-bold">Browser reminders</h3>
          {toggle('checkbox-reminders', 'Remind me while Pixel Quest is open', rem.prefs.enabled, rem.setEnabled, 'Set a time on each habit. Checked while this app is open and when you return to the tab. These are not push notifications and will not arrive if the browser is closed.')}
          <p data-testid="text-reminder-permission" className="mt-2 text-[11px] text-[#837c96]">{rem.permission === 'unsupported' ? 'This browser does not support notifications.' : rem.permission === 'denied' ? 'Notifications are blocked. Allow them in your browser site settings.' : rem.permission === 'granted' ? 'Notifications allowed.' : 'Permission will be requested when you turn this on or set a time.'}</p></div></Panel>
      <Panel><SectionHead eyebrow="HELP" title="How the rules work"/><ul data-testid="list-rules" className="space-y-2.5 text-sm text-[#b9b3c8]">{s.rules.map((r, i) => <li key={i} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 bg-[#73e6df]"/>{r}</li>)}</ul></Panel>
      {picker && <Modal title="Choose avatar" onClose={() => setPicker(false)} wide><div className="grid gap-3 sm:grid-cols-2">{p.avatars.map((a) => { const sel = a.id === p.avatarId; return <button key={a.id} data-testid={`button-avatar-${a.id}`} disabled={!a.unlocked || isPending('profile:')} aria-pressed={sel} onClick={() => void run({ action: 'profile', avatarId: a.id }).then((r) => { if (r) setPicker(false); })} className={cx('flex gap-3 border-2 p-3 text-left', sel ? 'border-[#f5ca62] bg-[#363043]' : a.unlocked ? 'border-[#49445d] bg-[#1c1a2b] hover:border-[#73e6df]' : 'cursor-not-allowed border-[#39354e] bg-[#181726] opacity-70')}>
        <PixelAvatar id={a.id} size={64} locked={!a.unlocked}/><span className="min-w-0"><b className="block text-sm">{a.name}</b><span className="block text-[10px] text-[#73e6df]">{a.role}</span><span className="mt-1 block text-[11px] text-[#928ba4]">{a.description}</span><span className="mt-2 flex items-center gap-1 font-mono text-[8px] text-[#f5ca62]">{sel ? <><Check size={11}/> EQUIPPED</> : a.unlocked ? 'SELECT' : <><LockKeyhole size={11}/> LEVEL {a.requiredLevel}</>}</span></span></button>; })}</div></Modal>}
    </>;
  }}</Gate>;
}
