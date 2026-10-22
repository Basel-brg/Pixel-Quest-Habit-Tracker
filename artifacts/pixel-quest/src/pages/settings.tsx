import { useClerk } from '@clerk/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { LogOut, Volume2, VolumeX, Waves } from 'lucide-react';
import { Btn, Field, Gate, PageHead, Panel, SectionHead } from '@/components/kit';
import { ThemePicker } from '@/components/theme-picker';
import { setPref, usePrefs } from '@/lib/feedback';
import { useRpg } from '@/lib/rpg-context';
import { useReminders } from '@/lib/reminders';

function zones(current: string): string[] {
  const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  const list = fn ? fn('timeZone') : ['UTC', 'Europe/Istanbul', 'America/New_York', 'Europe/London', 'Asia/Dubai', 'Asia/Tokyo'];
  return list.includes(current) ? list : [current, ...list];
}

export default function SettingsPage() {
  const prefs = usePrefs();
  const { signOut } = useClerk();
  const { run, isPending, clearError } = useRpg();
  const rem = useReminders();
  const [tz, setTz] = useState('');
  const [editingName, setEditingName] = useState(false);
  const form = useForm<{ username: string }>({ defaultValues: { username: '' } });
  const submit = form.handleSubmit(async v => { clearError(); if (await run({ action: 'profile', username: v.username.trim() }, { key: 'profile:name' })) setEditingName(false); });
  return <Gate>{s => <>
    <PageHead eyebrow="Your preferences" title="Settings" sub="Appearance follows your account. Sound and visual effects are saved on this device."/>
    <Panel><SectionHead eyebrow="APPEARANCE" title="Choose your world"/><ThemePicker/></Panel>
    <Panel><SectionHead eyebrow="THIS DEVICE" title="Sound & effects"/>
      <div className="grid gap-3 sm:grid-cols-2">
        <Btn testId="button-toggle-audio" variant="quiet" className="min-h-14 justify-between" onClick={() => setPref('muted', !prefs.muted)} pressed={!prefs.muted}>{prefs.muted ? <VolumeX size={20}/> : <Volume2 size={20}/>}Sound <b>{prefs.muted ? 'OFF' : 'ON'}</b></Btn>
        <Btn testId="button-toggle-scanlines" variant="quiet" className="min-h-14 justify-between" onClick={() => setPref('scanlines', !prefs.scanlines)} pressed={prefs.scanlines}><Waves size={20}/>Scanlines <b>{prefs.scanlines ? 'ON' : 'OFF'}</b></Btn>
      </div>
    </Panel>
    <Panel><SectionHead eyebrow="DAILY RULES" title="Time & bonuses"/>
      <Field label="Timezone" hint="Daily boundaries use this zone. After setup it can change once every 7 days."><select data-testid="select-timezone" className="field" value={tz || s.timezone} onChange={e => setTz(e.target.value)}>{zones(s.timezone).map(z => <option key={z} value={z}>{z}</option>)}</select></Field>
      <Btn testId="button-save-timezone" variant="quiet" className="my-3 min-h-12" disabled={!tz || tz === s.timezone || isPending('settings:')} onClick={() => void run({ action: 'settings', timezone: tz }).then(r => { if (r) setTz(''); })}>Save timezone</Btn>
      <label className="flex min-h-14 items-center gap-3 text-sm"><input type="checkbox" data-testid="checkbox-chest" checked={s.chest.enabled} disabled={isPending('settings:')} onChange={e => void run({ action: 'settings', chestEnabled: e.target.checked })}/>Enable optional daily chest</label>
      <p className="text-xs text-[color:var(--pq-mute)]">After all scheduled habits: 10 Gold 50%, Coffee break 30%, Movie time 20%. No paid draws or cash value.</p>
    </Panel>
    <Panel><SectionHead eyebrow="THIS BROWSER" title="Reminders"/>
      <label className="flex min-h-14 items-center gap-3 text-sm"><input type="checkbox" data-testid="checkbox-reminders" checked={rem.prefs.enabled} onChange={e => rem.setEnabled(e.target.checked)}/>Remind me while Pixel Quest is open</label>
      <p className="text-xs text-[color:var(--pq-mute)]">Set times on your habits. Browser reminders work only while the app is open or when you return to the tab, not when the browser is closed.</p>
      <p data-testid="text-reminder-permission" className="mt-2 text-xs text-[color:var(--pq-mute)]">{rem.permission === 'unsupported' ? 'Notifications are not supported here.' : rem.permission === 'denied' ? 'Notifications are blocked. Allow them in browser site settings.' : rem.permission === 'granted' ? 'Notifications allowed.' : 'Permission will be requested when you enable reminders.'}</p>
    </Panel>
    <Panel><SectionHead eyebrow="ACCOUNT" title="Player name"/>
      {editingName ? <Form {...form}><form onSubmit={e => void submit(e)} className="space-y-3"><Field label="Username"><input autoFocus data-testid="input-username" className="field" {...form.register('username', { required: 'Username is required.', pattern: { value: /^[A-Za-z0-9_]{3,20}$/, message: 'Use 3–20 letters, numbers or underscores.' } })}/></Field>
        {form.formState.errors.username && <p data-testid="error-username" role="alert" className="text-xs text-[color:var(--pq-danger)]">{form.formState.errors.username.message}</p>}
        <div className="flex gap-3"><Btn testId="button-save-username" type="submit" disabled={isPending('profile:name')}>Save name</Btn><Btn testId="button-cancel-username" variant="quiet" onClick={() => setEditingName(false)}>Cancel</Btn></div>
      </form></Form> : <div className="flex flex-wrap items-center justify-between gap-3"><span>{s.profile.username}</span><Btn testId="button-edit-username" variant="quiet" onClick={() => { form.reset({ username: s.profile.username }); clearError(); setEditingName(true); }}>Edit name</Btn></div>}
    </Panel>
    <Panel><SectionHead eyebrow="ACCOUNT" title="Session"/>
      <p className="mb-4 text-sm text-[color:var(--pq-mute)]">Your saved progress stays in your account when you sign out.</p>
      <Btn testId="button-logout" variant="danger" className="min-h-14" onClick={() => void signOut({ redirectUrl: import.meta.env.BASE_URL })}><LogOut size={20}/>Log out</Btn>
    </Panel>
    <Panel><SectionHead eyebrow="HELP" title="How the rules work"/><ul data-testid="list-rules" className="space-y-3 text-sm text-[color:var(--pq-mute)]">{s.rules.map((r, i) => <li key={i}>{r}</li>)}</ul></Panel>
  </>}</Gate>;
}
