import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import type { RpgSkills } from '@workspace/api-client-react';

export function SkillRadar({ skills }: { skills: RpgSkills }) {
  const data = (['STR', 'INT', 'WIS'] as const).map((k) => ({ stat: k, value: skills[k] }));
  const max = Math.max(10, ...data.map((d) => d.value));
  return <div data-testid="chart-skills">
    <div className="h-[220px] w-full" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><RadarChart data={data} outerRadius="72%">
      <PolarGrid stroke="#514967"/><PolarAngleAxis dataKey="stat" tick={{ fill: '#d6cfae', fontSize: 12 }}/><PolarRadiusAxis domain={[0, max]} tick={false} axisLine={false}/>
      <Radar dataKey="value" stroke="#73e6df" fill="#73e6df" fillOpacity={0.35} isAnimationActive={false}/></RadarChart></ResponsiveContainer></div>
    <ul className="mt-2 grid grid-cols-3 gap-2 text-center">{data.map((d) => <li key={d.stat} data-testid={`text-skill-${d.stat}`} className="border border-[#49445d] bg-[#1c1a2b] p-2"><b className="block font-mono text-sm text-[#f5ca62]">{d.value}</b><span className="text-[11px] text-[#928ba4]">{d.stat} of {max}</span></li>)}</ul>
  </div>;
}
