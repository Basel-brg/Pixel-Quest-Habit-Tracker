import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import type { RpgSkills } from '@workspace/api-client-react';

/** `highlight` marks a chosen hero path axis without changing values. */
export function SkillRadar({ skills, highlight }: { skills: RpgSkills; highlight?: keyof RpgSkills | null }) {
  const data = (['STR', 'INT', 'WIS'] as const).map((k) => ({ stat: k, value: skills[k] }));
  const max = Math.max(10, ...data.map((d) => d.value));
  return <div data-testid="chart-skills">
    <div className="h-[220px] w-full" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><RadarChart data={data} outerRadius="72%">
      <PolarGrid stroke="var(--pq-line)"/><PolarAngleAxis dataKey="stat" tick={(p: { x: number; y: number; payload: { value: string } }) => <text x={p.x} y={p.y} dy={4} textAnchor="middle" fontSize={highlight === p.payload.value ? 14 : 12} fontWeight={highlight === p.payload.value ? 700 : 400} fill={highlight === p.payload.value ? 'var(--pq-gold)' : 'var(--pq-ink)'}>{highlight === p.payload.value ? `> ${p.payload.value} <` : p.payload.value}</text>}/><PolarRadiusAxis domain={[0, max]} tick={false} axisLine={false}/>
      <Radar dataKey="value" stroke="var(--pq-cyan)" fill="var(--pq-cyan)" fillOpacity={0.35} isAnimationActive={false}/></RadarChart></ResponsiveContainer></div>
    <ul className="mt-2 grid grid-cols-3 gap-2 text-center">{data.map((d) => <li key={d.stat} data-testid={`text-skill-${d.stat}`} data-highlight={highlight === d.stat || undefined} className={`border bg-[color:var(--pq-panel2)] p-2 ${highlight === d.stat ? 'border-[color:var(--pq-gold)] border-2' : 'border-[color:var(--pq-line2)]'}`}><b className="block font-mono text-sm text-[color:var(--pq-gold)]">{d.value}</b><span className="text-[11px] text-[color:var(--pq-mute)]">{d.stat} of {max}</span></li>)}</ul>
  </div>;
}
