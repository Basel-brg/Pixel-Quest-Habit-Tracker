import { useState } from 'react';
import { Check, LockKeyhole } from 'lucide-react';
import { PixelAvatar } from '@/components/pixel-avatar';
import { Modal, cx } from '@/components/kit';
import { useRpg } from '@/lib/rpg-context';
import { themedLabel } from '@/lib/avatar-art';
import { useTheme } from '@/lib/theme';

const xpAtLevel = (level: number) => Math.max(0, level - 1) * level * 50;

export function AvatarQuickSwitch() {
  const { snap, run, isPending, clearError } = useRpg();
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  if (!snap) return null;
  const profile = snap.profile;
  const next = profile.avatars.filter((avatar) => !avatar.unlocked).sort((a, b) => a.requiredLevel - b.requiredLevel)[0];
  const lastUnlockedLevel = Math.max(1, ...profile.avatars.filter((avatar) => avatar.unlocked).map((avatar) => avatar.requiredLevel));
  const startXp = xpAtLevel(lastUnlockedLevel);
  const targetXp = next ? xpAtLevel(next.requiredLevel) : startXp;
  const xpRemaining = Math.max(0, targetXp - profile.xp);
  const progress = next ? Math.max(0, Math.min(100, ((profile.xp - startXp) / Math.max(1, targetXp - startXp)) * 100)) : 100;

  return <>
    <button
      type="button"
      data-testid="button-header-avatar"
      aria-label="Open avatar quick switch"
      aria-haspopup="dialog"
      onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); clearError(); setOpen(true); }}
      className="grid h-11 w-11 shrink-0 place-items-center border-2 border-[color:var(--pq-gold)] bg-[color:var(--pq-panel2)] shadow-[3px_3px_0_var(--pq-shadow)] transition-transform hover:-translate-y-0.5"
    >
      <PixelAvatar id={profile.avatarId} size={34} testId="img-header-avatar"/>
    </button>
    {open && <Modal title="AVATAR QUICK SWITCH" onClose={() => setOpen(false)} wide>
      <div className="space-y-5">
        <section className="border-2 border-[color:var(--pq-line2)] bg-[color:var(--pq-panel2)] p-4" data-testid="avatar-progression">
          {next ? <>
            <div className="flex items-center gap-3">
              <div className="relative grid h-[68px] w-[68px] shrink-0 place-items-center border border-[color:var(--pq-line)] bg-[color:var(--pq-panel)]">
                <PixelAvatar id={next.id} size={58} locked/>
                <LockKeyhole size={15} className="absolute bottom-1 right-1 text-[color:var(--pq-mute)]"/>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[9px] uppercase tracking-wider text-[color:var(--pq-mute)]">NEXT AVATAR</p>
                <p className="mt-1 truncate text-sm font-bold">{themedLabel(theme, next.id, next).name}</p>
                <p className="mt-1 text-[11px] text-[color:var(--pq-ink2)]">Level {next.requiredLevel} required · {Math.max(0, next.requiredLevel - profile.level)} levels remaining</p>
                <p className="mt-1 font-mono text-[9px] text-[color:var(--pq-cyan)]">{xpRemaining.toLocaleString()} XP remaining</p>
              </div>
            </div>
            <div className="mt-4 h-3 border border-[color:var(--pq-line)] bg-[color:var(--pq-bg)]">
              <div className="h-full bg-[color:var(--pq-gold)] transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-right font-mono text-[8px] text-[color:var(--pq-mute)]">{Math.floor(progress)}% TO UNLOCK</p>
          </> : <p className="text-sm font-bold text-[color:var(--pq-gold)]">All avatars unlocked. Choose any character below.</p>}
        </section>

        <section>
          <p className="mb-3 font-mono text-[9px] uppercase tracking-wider text-[color:var(--pq-mute)]">UNLOCKED · TAP TO EQUIP</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {profile.avatars.filter((avatar) => avatar.unlocked).map((avatar) => {
              const equipped = avatar.id === profile.avatarId;
              const label = themedLabel(theme, avatar.id, avatar);
              return <button
                key={avatar.id}
                type="button"
                data-testid={`quick-avatar-${avatar.id}`}
                aria-pressed={equipped}
                disabled={equipped || isPending('profile:')}
                onClick={() => void run({ action: 'profile', avatarId: avatar.id }).then((result) => { if (result) setOpen(false); })}
                className={cx('flex min-h-[76px] items-center gap-3 border-2 p-2 text-left disabled:cursor-default', equipped ? 'border-[color:var(--pq-gold)] bg-[color:var(--pq-line2)]' : 'border-[color:var(--pq-line3)] bg-[color:var(--pq-panel2)] hover:border-[color:var(--pq-cyan)]')}
              >
                <PixelAvatar id={avatar.id} size={52}/>
                <span className="min-w-0 flex-1"><b className="block truncate text-xs">{label.name}</b><span className="mt-1 block truncate text-[10px] text-[color:var(--pq-mute)]">{label.role}</span></span>
                {equipped ? <Check size={16} className="text-[color:var(--pq-gold)]"/> : null}
              </button>;
            })}
          </div>
        </section>

        {profile.avatars.some((avatar) => !avatar.unlocked) ? <section>
          <p className="mb-3 font-mono text-[9px] uppercase tracking-wider text-[color:var(--pq-mute)]">LOCKED PREVIEW</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {profile.avatars.filter((avatar) => !avatar.unlocked).map((avatar) => <div key={avatar.id} data-testid={`quick-avatar-locked-${avatar.id}`} className="flex min-h-[76px] items-center gap-3 border border-[color:var(--pq-line3)] bg-[color:var(--pq-panel2)] p-2 opacity-75">
              <div className="relative"><PixelAvatar id={avatar.id} size={52} locked/><LockKeyhole size={13} className="absolute bottom-0 right-0 text-[color:var(--pq-mute)]"/></div>
              <span className="min-w-0"><b className="block truncate text-xs">{themedLabel(theme, avatar.id, avatar).name}</b><span className="mt-1 block text-[10px] text-[color:var(--pq-mute)]">Unlock at Level {avatar.requiredLevel}</span></span>
            </div>)}
          </div>
        </section> : null}
      </div>
    </Modal>}
  </>;
}
