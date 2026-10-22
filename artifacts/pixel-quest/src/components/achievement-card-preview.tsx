import { forwardRef } from 'react';
import type { RpgSnapshot } from '@workspace/api-client-react';
import { PixelAvatar } from '@/components/pixel-avatar';
import { themedLabel } from '@/lib/avatar-art';
import type { ShareMilestone } from '@/lib/share-milestones';
import { THEME_META, type ThemeId } from '@/lib/theme';

export type AchievementCardAspect = 'story' | 'square';

interface AchievementCardPreviewProps {
  milestone: ShareMilestone;
  snapshot: RpgSnapshot;
  themeId: ThemeId;
  aspect: AchievementCardAspect;
}

const dimensions: Record<AchievementCardAspect, { width: number; height: number }> = {
  story: { width: 540, height: 960 },
  square: { width: 900, height: 900 },
};

function wrapHeadline(text: string, limit: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > limit && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= 2) return lines;
  return [lines[0], `${lines.slice(1).join(' ').slice(0, limit - 1).trimEnd()}…`];
}

function SkillTriangle({ skills, theme, square }: { skills: RpgSnapshot['skills']; theme: ThemeId; square: boolean }) {
  const meta = THEME_META[theme];
  const values = [
    { label: 'STR', value: skills.STR, x: 95, y: 31 },
    { label: 'INT', value: skills.INT, x: 165, y: 176 },
    { label: 'WIS', value: skills.WIS, x: 25, y: 176 },
  ];
  const max = Math.max(10, skills.STR, skills.INT, skills.WIS);
  const center = { x: 95, y: 115 };
  const profile = [
    { x: 95, y: 15, value: skills.STR },
    { x: 175, y: 166, value: skills.INT },
    { x: 15, y: 166, value: skills.WIS },
  ].map(point => {
    const amount = Math.min(1, Math.max(0, point.value / max));
    return `${center.x + (point.x - center.x) * amount},${center.y + (point.y - center.y) * amount}`;
  }).join(' ');
  return (
    <svg
      x={square ? 620 : 175}
      y={square ? 626 : 684}
      width={square ? 180 : 190}
      height={square ? 180 : 190}
      viewBox="0 0 190 210"
      aria-label={`Skill triangle: Strength ${skills.STR}, Intelligence ${skills.INT}, Wisdom ${skills.WIS}`}
      role="img"
      data-testid="graphic-skill-triangle"
    >
      <path d="M95 15 L15 166 L175 166 Z" fill={meta.a} fillOpacity=".09" stroke={meta.b} strokeOpacity=".8" strokeWidth="2" />
      <path d="M95 15 L95 116 M15 166 L95 116 L175 166 M15 166 L175 166" fill="none" stroke={meta.b} strokeOpacity=".42" strokeWidth="1.5" strokeDasharray="5 5" />
      <polygon points={profile} fill={meta.a} fillOpacity=".25" stroke={meta.a} strokeWidth="2" strokeLinejoin="round" />
      {profile.split(' ').map((point, index) => {
        const [cx, cy] = point.split(',').map(Number);
        return <circle key={index} cx={cx} cy={cy} r="3.5" fill={meta.a} stroke={meta.panel} strokeWidth="1.5" />;
      })}
      <circle cx="95" cy="15" r="4" fill={meta.a} />
      <circle cx="15" cy="166" r="4" fill={meta.b} />
      <circle cx="175" cy="166" r="4" fill={meta.a} />
      {values.map((item) => (
        <g key={item.label} transform={`translate(${item.x},${item.y})`}>
          <rect x="-21" y="-15" width="42" height="38" rx={theme === 'cozy' || theme === 'anime' ? 8 : 0} fill={meta.panel} stroke={meta.b} strokeOpacity=".7" />
          <text x="0" y="-1" textAnchor="middle" fontSize="9" fontWeight="700" fill={meta.ink} letterSpacing="1">{item.label}</text>
          <text x="0" y="15" textAnchor="middle" fontSize="13" fontWeight="800" fill={meta.a}>{item.value}</text>
        </g>
      ))}
    </svg>
  );
}

export const AchievementCardPreview = forwardRef<SVGSVGElement, AchievementCardPreviewProps>(
  function AchievementCardPreview({ milestone, snapshot, themeId, aspect }, ref) {
    const meta = THEME_META[themeId];
    const { width, height } = dimensions[aspect];
    const square = aspect === 'square';
    const border = themeId === 'brutalist' ? '#111111' : meta.b;
    const font = meta.font;
    const avatarSize = square ? 210 : 180;
    const avatarX = square ? 112 : 180;
    const avatarY = square ? 310 : 350;
    const headlineLines = wrapHeadline(milestone.headline, square ? 31 : 23);
    const headlineY = square ? 194 : 237;
    const headlineSize = square ? 39 : 37;
    const xpIntoLevel = Math.max(0, snapshot.profile.xp);
    const avatarOption = snapshot.profile.avatars.find((avatar) => avatar.id === snapshot.profile.avatarId);
    const heroTitle = avatarOption ? themedLabel(themeId, avatarOption.id, avatarOption).name : snapshot.profile.avatarId;
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${milestone.headline}, Pixel Quest achievement card for ${snapshot.profile.username}`}
        data-testid="preview-achievement-card"
        style={{ display: 'block', width: '100%', height: 'auto', maxHeight: square ? 500 : 560, fontFamily: font }}
      >
        <defs>
          <pattern id={`pixel-grid-${aspect}`} width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke={meta.b} strokeOpacity=".1" strokeWidth="1" />
          </pattern>
          <linearGradient id={`card-wash-${aspect}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={meta.a} stopOpacity=".15" />
            <stop offset="1" stopColor={meta.b} stopOpacity=".025" />
          </linearGradient>
        </defs>
        <rect width={width} height={height} fill={meta.bg} />
        <rect width={width} height={height} fill={`url(#pixel-grid-${aspect})`} />
        <rect x="20" y="20" width={width - 40} height={height - 40} fill={`url(#card-wash-${aspect})`} stroke={border} strokeWidth={themeId === 'brutalist' ? 8 : 3} />
        <path d={`M38 105 H${width - 38}`} stroke={meta.b} strokeOpacity=".45" strokeWidth="2" />
        <rect x="39" y="43" width="12" height="12" fill={meta.a} />
        <rect x="55" y="43" width="12" height="12" fill={meta.b} />
        <text x="82" y="56" fill={meta.b} fontSize={square ? 18 : 14} fontWeight="800" letterSpacing={themeId === 'parchment' ? 2 : 3}>PIXEL QUEST</text>
        <text x={width - 43} y="56" textAnchor="end" fill={meta.ink} fillOpacity=".56" fontSize={square ? 13 : 10} letterSpacing="2">MILESTONE / {milestone.type.toUpperCase()}</text>

        <g aria-hidden="true">
          <path d={square ? 'M450 138l17 36h-34z' : 'M270 131l14 30h-28z'} fill={meta.a} opacity=".9" />
          <path d={square ? 'M477 167h18v18h-18z' : 'M296 157h14v14h-14z'} fill={meta.b} opacity=".7" />
          <path d={square ? 'M405 165h10v10h-10z' : 'M232 173h8v8h-8z'} fill={meta.a} opacity=".5" />
        </g>
        <text x={width / 2} y={headlineY} textAnchor="middle" fill={meta.ink} fontSize={headlineSize} fontWeight="800" letterSpacing={themeId === 'cyberpunk' ? 1 : 0}>
          {headlineLines.map((line, index) => <tspan key={`${line}-${index}`} x={width / 2} dy={index === 0 ? 0 : headlineSize * 1.18}>{line}</tspan>)}
        </text>
        <text x={width / 2} y={headlineY + (headlineLines.length - 1) * headlineSize * 1.18 + 37} textAnchor="middle" fill={meta.ink} fillOpacity=".68" fontSize={square ? 18 : 15}>
          {milestone.detail.length > 68 ? `${milestone.detail.slice(0, 65)}…` : milestone.detail}
        </text>

        <rect x={avatarX - 12} y={avatarY - 12} width={avatarSize + 24} height={avatarSize + 24} rx={themeId === 'cozy' || themeId === 'anime' ? 20 : 0} fill={meta.panel} stroke={meta.a} strokeWidth="3" />
        {/* Place the avatar's art in the frame coordinate system. */}
        <g transform={`translate(${avatarX},${avatarY})`}>
          <PixelAvatar id={snapshot.profile.avatarId} size={avatarSize} themeId={themeId} />
        </g>
        <text x={width / 2} y={square ? 540 : 544} textAnchor="middle" fill={meta.ink} fontSize={square ? 24 : 21} fontWeight="800">{snapshot.profile.username}</text>
        <text x={width / 2} y={square ? 574 : 579} textAnchor="middle" fill={meta.a} fontSize={square ? 17 : 14} fontWeight="700" letterSpacing="2">LEVEL {snapshot.profile.level} · {heroTitle}</text>
        <rect x={square ? 280 : 112} y={square ? 594 : 598} width={square ? 340 : 316} height="2" fill={meta.b} opacity=".35" />
        <text x={width / 2} y={square ? 625 : 628} textAnchor="middle" fill={meta.ink} fillOpacity=".72" fontSize={square ? 14 : 12} letterSpacing="1.5">TOTAL EXPERIENCE</text>
        <text x={width / 2} y={square ? 653 : 658} textAnchor="middle" fill={meta.a} fontSize={square ? 25 : 22} fontWeight="800">{xpIntoLevel.toLocaleString()} XP</text>
        <SkillTriangle skills={snapshot.skills} theme={themeId} square={square} />
        <text x={width / 2} y={height - 47} textAnchor="middle" fill={meta.ink} fillOpacity=".55" fontSize={square ? 12 : 11} letterSpacing="1">
          HABITS TURNED INTO EARNED ADVENTURES
        </text>
        <path d={`M40 ${height - 82} H${width - 40}`} stroke={meta.b} strokeOpacity=".3" />
        <text x={width / 2} y={height - 27} textAnchor="middle" fill={meta.b} fontSize="10" letterSpacing="2">PIXELQUEST / KEEP GOING</text>
        <title>{milestone.headline} — {snapshot.profile.username}, level {snapshot.profile.level}</title>
        <desc>Achievement card showing {snapshot.profile.xp} experience and Strength, Intelligence, and Wisdom stats.</desc>
      </svg>
    );
  },
);
