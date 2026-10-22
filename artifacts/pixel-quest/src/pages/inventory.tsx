import { useState, type FormEvent } from 'react';
import { Package, Pencil, Trash2 } from 'lucide-react';
import type { RpgInventoryItem } from '@workspace/api-client-react';
import { Btn, Empty, Field, Gate, Modal, PageHead, Panel, SectionHead, cx } from '@/components/kit';
import { useRpg } from '@/lib/rpg-context';

export default function InventoryPage() {
  const { run, isPending } = useRpg();
  const [edit, setEdit] = useState<RpgInventoryItem | null>(null); const [title, setTitle] = useState(''); const [desc, setDesc] = useState('');
  const save = async (e: FormEvent) => { e.preventDefault(); if (!edit) return; const r = await run({ action: 'updateItem', itemId: edit.id, title: title.trim(), description: desc.trim() }, { key: 'updateItem:editor' }); if (r) setEdit(null); };
  return <Gate>{(s) => <>
    <PageHead eyebrow="Gear up" title="Inventory" sub="Spend Gold at the merchant. Shields, boots and camping gear change how the rules treat you."/>
    <Panel><SectionHead eyebrow="MERCHANT" title="Wares" action={<span data-testid="text-inventory-gold" className="font-mono text-xs text-[color:var(--pq-gold)]">{s.profile.gold} G</span>}/>
      {s.merchant.length ? <div className="grid gap-3 md:grid-cols-2">{s.merchant.map((m) => { const lvl = s.profile.level < m.requiredLevel; const poor = s.profile.gold < m.price;
        return <article key={m.id} data-testid={`card-merchant-${m.id}`} className="flex flex-col border border-[color:var(--pq-line2)] bg-[color:var(--pq-panel2)] p-4"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-bold">{m.name}</h3><span className="font-mono text-xs text-[color:var(--pq-gold)]">{m.price} G</span></div>
          <p className="mt-2 flex-1 text-xs text-[color:var(--pq-mute)]">{m.description}</p><p className="mt-2 font-mono text-[9px] uppercase text-[color:var(--pq-mute)]">{m.consumable ? 'Consumable' : 'Equipment'} · level {m.requiredLevel}</p>
          <Btn testId={`button-buy-${m.id}`} className="mt-3 text-xs" disabled={lvl || poor || isPending(`buyItem:${m.id}`)} onClick={() => void run({ action: 'buyItem', itemId: m.id })}>{lvl ? `Needs level ${m.requiredLevel}` : poor ? 'Not enough Gold' : isPending(`buyItem:${m.id}`) ? 'Buying...' : 'Buy'}</Btn></article>; })}</div>
        : <Empty title="MERCHANT AWAY" detail="No wares are available right now."/>}</Panel>
    <Panel><SectionHead eyebrow="OWNED" title="Your pack"/>
      {s.inventory.length ? <div className="grid gap-3 md:grid-cols-2">{s.inventory.map((i) => { const cons = s.merchant.find((m) => m.id === i.catalogId)?.consumable ?? false; const busy = isPending(`equipItem:${i.id}`) || isPending(`consumeItem:${i.id}`) || isPending(`deleteItem:${i.id}`);
        return <article key={i.id} data-testid={`card-item-${i.id}`} className={cx('border p-4', i.equipped ? 'border-[color:var(--pq-gold)]/60 bg-[color:var(--pq-line3)]' : 'border-[color:var(--pq-line2)] bg-[color:var(--pq-panel2)]')}>
          <div className="flex items-start justify-between gap-3"><h3 className="text-sm font-bold">{i.name}</h3><span className="font-mono text-[10px] text-[color:var(--pq-cyan)]">x{i.quantity}{i.equipped && ' · EQUIPPED'}</span></div><p className="mt-2 text-xs text-[color:var(--pq-mute)]">{i.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {cons ? <Btn testId={`button-use-${i.id}`} variant="cyan" className="!px-3 !py-1.5 text-xs" disabled={busy} onClick={() => void run({ action: 'consumeItem', itemId: i.id })}>Use</Btn>
              : <Btn testId={`button-equip-${i.id}`} variant={i.equipped ? 'quiet' : 'gold'} className="!px-3 !py-1.5 text-xs" disabled={busy} onClick={() => void run({ action: 'equipItem', itemId: i.id, equipped: !i.equipped })}>{i.equipped ? 'Unequip' : 'Equip'}</Btn>}
            <Btn testId={`button-rename-${i.id}`} variant="quiet" className="!px-3 !py-1.5 text-xs" disabled={busy} onClick={() => { setEdit(i); setTitle(i.name); setDesc(i.description); }}><Pencil size={12}/> Rename</Btn>
            <Btn testId={`button-discard-${i.id}`} variant="danger" className="!px-3 !py-1.5 text-xs" disabled={busy} onClick={() => { if (window.confirm(`Discard ${i.name}? No refund.`)) void run({ action: 'deleteItem', itemId: i.id }); }}><Trash2 size={12}/> Discard</Btn></div></article>; })}</div>
        : <Empty title="EMPTY PACK" detail="Buy something from the merchant above." action={<Package className="mx-auto text-[color:var(--pq-cyan)]"/>}/>}</Panel>
    {edit && <Modal title="Rename item" onClose={() => setEdit(null)}><form onSubmit={(e) => void save(e)} className="space-y-4">
      <Field label="Label"><input autoFocus required maxLength={120} data-testid="input-item-title" value={title} onChange={(e) => setTitle(e.target.value)} className="field"/></Field>
      <Field label="Description"><textarea maxLength={300} rows={3} data-testid="input-item-description" value={desc} onChange={(e) => setDesc(e.target.value)} className="field"/></Field>
      <div className="flex justify-end gap-2"><Btn testId="button-cancel-item" variant="quiet" onClick={() => setEdit(null)}>Cancel</Btn><Btn testId="button-save-item" type="submit" disabled={isPending('updateItem:editor')}>Save</Btn></div></form></Modal>}
  </>}</Gate>;
}
