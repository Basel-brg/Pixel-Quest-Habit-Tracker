import Svg, { Polygon, Text as SvgText } from 'react-native-svg';
import type { RpgSkills } from '@workspace/api-client-react';
import { Text, View } from '@/components/Themed';
import { useColors } from '@/hooks/useColors';

type Point = readonly [number, number];
const center: Point = [150, 148];
const vertices: Record<keyof RpgSkills, Point> = {
  STR: [150, 26],
  INT: [256, 210],
  WIS: [44, 210],
};
const keys: (keyof RpgSkills)[] = ['STR', 'INT', 'WIS'];
const polygonPoints = (values: readonly Point[]) => values.map(([x, y]) => `${x},${y}`).join(' ');
const atScale = (scale: number) => keys.map(key => [
  center[0] + (vertices[key][0] - center[0]) * scale,
  center[1] + (vertices[key][1] - center[1]) * scale,
] as Point);

export function SkillRadar({ skills }: { skills: RpgSkills }) {
  const colors = useColors();
  const values = keys.map(key => skills[key]);
  const max = Math.max(10, ...values);
  const progress = keys.map(key => Math.max(0, Math.min(1, skills[key] / max)));
  const skillPoints = keys.map((key, i) => [
    center[0] + (vertices[key][0] - center[0]) * progress[i],
    center[1] + (vertices[key][1] - center[1]) * progress[i],
  ] as Point);

  return <View testID="chart-skills" accessible accessibilityLabel={`Character skills: strength ${skills.STR}, intelligence ${skills.INT}, wisdom ${skills.WIS}`}>
    <Svg width="100%" height={238} viewBox="0 0 300 250">
      {[1 / 3, 2 / 3, 1].map(scale => <Polygon key={scale} points={polygonPoints(atScale(scale))} fill="transparent" stroke={colors.border} strokeWidth={1.4}/>)}
      {keys.map(key => <Polygon key={`axis-${key}`} points={polygonPoints([center, vertices[key]])} fill="transparent" stroke={colors.border} strokeWidth={1.2}/>)}
      <Polygon points={polygonPoints(skillPoints)} fill={colors.cyan} fillOpacity={0.3} stroke={colors.cyan} strokeWidth={2.5}/>
      <SvgText x={150} y={19} textAnchor="middle" fill={colors.foreground} fontSize={15} fontWeight="700">STR</SvgText>
      <SvgText x={35} y={234} textAnchor="middle" fill={colors.foreground} fontSize={15} fontWeight="700">WIS</SvgText>
      <SvgText x={265} y={234} textAnchor="middle" fill={colors.foreground} fontSize={15} fontWeight="700">INT</SvgText>
    </Svg>
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
      {keys.map(key => <View key={key} testID={`text-skill-${key}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 68, paddingHorizontal: 4, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.secondary }}>
        <Text style={{ color: colors.gold, fontWeight: '700', fontSize: 18 }}>{skills[key]}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{key} of {max}</Text>
      </View>)}
    </View>
  </View>;
}
