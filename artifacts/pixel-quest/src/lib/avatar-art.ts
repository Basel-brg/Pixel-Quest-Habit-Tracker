// Theme-specific avatar skins. Pure vector geometry on a 16x16 grid: [x, y, w, h, fill].
// Canonical AvatarIds (novice/squire/knight/paladin) and level gates are unchanged; this is visuals only.
export type AvatarKey = 'novice' | 'squire' | 'knight' | 'paladin';
export type SkinTheme = 'retro' | 'anime' | 'cyberpunk' | 'parchment' | 'brutalist' | 'cozy';
export type R = [number, number, number, number, string];
export interface Skin { bg: string; frame?: string; art: R[]; glow?: string }

const K = '#0b0b10';
// ---------- ANIME ----------
const animeBody = (hair: string, eye: string, coat: string, trim: string): R[] => [
  [6, 0, 1, 1, hair], [9, 0, 2, 1, hair], [5, 1, 6, 2, hair], [4, 3, 1, 3, hair], [11, 3, 1, 2, hair], [5, 3, 6, 1, hair],
  [5, 4, 6, 3, '#f3d4bd'], [6, 4, 1, 2, eye], [9, 4, 1, 2, eye],
  [5, 7, 6, 5, coat], [7, 7, 2, 5, trim], [4, 8, 1, 3, coat], [11, 8, 1, 3, coat], [4, 11, 1, 1, '#f3d4bd'], [11, 11, 1, 1, '#f3d4bd'],
  [6, 12, 1, 3, '#1a2040'], [9, 12, 1, 3, '#1a2040'], [5, 15, 2, 1, trim], [9, 15, 2, 1, trim],
];
const ANIME: Record<AvatarKey, Skin> = {
  novice: { bg: '#0b1230', art: animeBody('#2a3a78', '#00f0ff', '#46598f', '#00f0ff') },
  squire: { bg: '#0b1230', art: [[3, 1, 10, 1, '#141a3a'], [4, 0, 8, 1, '#141a3a'], [3, 2, 2, 8, '#141a3a'], [11, 2, 2, 8, '#141a3a'], ...animeBody('#141a3a', '#b78cff', '#1b2350', '#8b6cff').slice(6),
    [3, 10, 1, 3, '#b78cff'], [12, 10, 1, 3, '#b78cff'], [2, 9, 1, 1, '#e6d9ff'], [13, 9, 1, 1, '#e6d9ff'], [5, 3, 6, 1, '#141a3a']] },
  knight: { bg: '#0b1230', glow: '#00f0ff', art: [[13, 1, 1, 10, '#e6fbff'], [13, 0, 1, 1, '#00f0ff'], [12, 11, 3, 1, '#b78cff'], [13, 12, 1, 2, '#8b6cff'],
    ...animeBody('#e8f3ff', '#00f0ff', '#e9f1ff', '#00f0ff'), [3, 7, 2, 1, '#8b6cff'], [2, 8, 2, 6, '#2a3a78'], [11, 9, 2, 1, '#f3d4bd']] },
  paladin: { bg: '#120b33', glow: '#b78cff', art: [[1, 0, 1, 15, '#8b6cff44'], [14, 0, 1, 15, '#8b6cff44'], [2, 13, 12, 1, '#00f0ff'], [3, 12, 10, 1, '#8b6cff'],
    [0, 5, 2, 9, '#5a2fd0'], [14, 5, 2, 9, '#5a2fd0'], [2, 7, 3, 7, '#7a4cf0'], [11, 7, 3, 7, '#7a4cf0'],
    [4, 0, 1, 2, '#00f0ff'], [6, 0, 1, 1, '#00f0ff'], [8, 0, 1, 2, '#00f0ff'], [11, 0, 1, 2, '#00f0ff'],
    ...animeBody('#1b1040', '#ffffff', '#1b1040', '#00f0ff').map((r): R => (r[4] === '#1a2040' ? [r[0], r[1], r[2], r[3], '#0e0830'] : r)),
    [3, 3, 1, 1, '#00f0ff'], [12, 2, 1, 1, '#ffffff'], [2, 10, 1, 1, '#ffffff'], [13, 9, 1, 1, '#00f0ff'], [7, 8, 2, 2, '#ffffff']] },
};
// ---------- CYBERPUNK ----------
const CY = { pink: '#ff0055', lime: '#d7ff1f', steel: '#2b2f3a', dark: '#14141c', skin: '#c99a82' };
const cyLegs = (c: string): R[] => [[5, 12, 2, 3, c], [9, 12, 2, 3, c], [5, 15, 2, 1, CY.pink], [9, 15, 2, 1, CY.pink]];
const CYBER: Record<AvatarKey, Skin> = {
  novice: { bg: '#0a0a0f', art: [[4, 1, 8, 2, '#1c1c28'], [3, 3, 1, 3, '#1c1c28'], [12, 3, 1, 3, '#1c1c28'], [5, 3, 6, 4, CY.skin], [5, 4, 6, 1, CY.pink], [6, 4, 1, 1, '#fff'], [9, 4, 1, 1, '#fff'],
    [4, 7, 8, 5, '#242434'], [7, 7, 2, 5, CY.pink], [3, 8, 1, 3, '#242434'], [12, 8, 1, 3, '#242434'], ...cyLegs('#15151d')] },
  squire: { bg: '#0a0a0f', art: [[7, 0, 2, 3, CY.lime], [6, 1, 1, 1, CY.lime], [9, 1, 1, 1, CY.lime], [5, 3, 6, 4, CY.skin], [5, 4, 6, 1, CY.lime], [4, 5, 1, 2, CY.lime], [11, 4, 1, 1, '#5cf'],
    [4, 7, 8, 5, '#1b2a2a'], [3, 8, 1, 3, '#1b2a2a'], [12, 7, 4, 3, '#222'], [13, 8, 2, 1, CY.lime], [12, 10, 4, 1, CY.pink], [4, 8, 1, 1, CY.lime], [2, 11, 1, 3, CY.lime], ...cyLegs('#15151d')] },
  knight: { bg: '#0a0a0f', art: [[4, 0, 8, 7, '#3a3f50'], [5, 1, 6, 1, '#555b70'], [5, 4, 6, 1, '#ff2a2a'], [7, 6, 2, 1, '#14141c'],
    [1, 7, 14, 3, '#4a5066'], [1, 7, 2, 1, CY.pink], [13, 7, 2, 1, CY.pink], [4, 7, 8, 6, CY.steel], [7, 8, 2, 3, CY.pink], [2, 10, 2, 3, CY.steel], [12, 10, 2, 3, CY.steel],
    [13, 9, 3, 2, '#14141c'], [15, 9, 1, 1, CY.lime], [4, 13, 3, 2, '#3a3f50'], [9, 13, 3, 2, '#3a3f50'], [4, 15, 3, 1, CY.pink], [9, 15, 3, 1, CY.pink]] },
  paladin: { bg: '#14040e', glow: CY.pink, art: [[0, 2, 1, 12, '#ff005566'], [15, 2, 1, 12, '#ff005566'], [1, 15, 14, 1, CY.pink],
    [3, 0, 1, 4, CY.lime], [12, 0, 1, 4, CY.lime], [4, 0, 1, 1, CY.lime], [11, 0, 1, 1, CY.lime], [5, 1, 6, 1, CY.pink],
    [5, 2, 6, 5, '#101018'], [5, 2, 3, 5, CY.skin], [8, 4, 3, 1, CY.pink], [9, 3, 1, 3, '#fff'], [6, 4, 1, 1, CY.lime],
    [2, 7, 12, 2, '#101018'], [2, 7, 12, 1, CY.pink], [4, 9, 8, 4, '#18181f'], [6, 9, 4, 3, CY.pink], [7, 10, 2, 1, '#fff'], [1, 9, 2, 4, '#101018'], [13, 9, 2, 4, '#101018'], [1, 13, 2, 1, CY.lime], [13, 13, 2, 1, CY.lime],
    [5, 13, 2, 2, '#101018'], [9, 13, 2, 2, '#101018'], [5, 15, 2, 1, CY.lime], [9, 15, 2, 1, CY.lime]] },
};
// ---------- PARCHMENT ----------
const P = { skin: '#e8b98e', ink: '#3b2a1a', leather: '#7a4a1e', crimson: '#9c1f2e', paper: '#d8c79d' };
const parBody = (cloth: string, trim: string): R[] => [
  [5, 3, 6, 4, P.skin], [6, 4, 1, 1, P.ink], [9, 4, 1, 1, P.ink], [7, 6, 2, 1, '#b97b5a'],
  [4, 7, 8, 5, cloth], [4, 10, 8, 1, trim], [3, 8, 1, 3, cloth], [12, 8, 1, 3, cloth], [3, 11, 1, 1, P.skin], [12, 11, 1, 1, P.skin],
  [5, 12, 2, 3, '#4a3320'], [9, 12, 2, 3, '#4a3320'], [4, 15, 3, 1, P.ink], [9, 15, 3, 1, P.ink],
];
const PARCH: Record<AvatarKey, Skin> = {
  novice: { bg: P.paper, art: [[3, 2, 10, 1, '#8a5a2a'], [5, 0, 6, 2, '#8a5a2a'], [5, 1, 6, 1, P.crimson], ...parBody('#6f8a4a', P.leather), [10, 7, 4, 5, '#8a5a2a'], [10, 7, 4, 1, '#5b3a1a'], [1, 2, 1, 13, '#5b3a1a'], [0, 1, 3, 1, '#5b3a1a']] },
  squire: { bg: P.paper, art: [[4, 0, 8, 3, '#3f5a35'], [3, 3, 1, 5, '#3f5a35'], [12, 3, 1, 5, '#3f5a35'], [5, 3, 6, 3, '#2a3a24'], [6, 4, 1, 1, '#f2e6c4'], [9, 4, 1, 1, '#f2e6c4'], [5, 6, 6, 1, P.skin],
    [3, 7, 10, 6, '#3f5a35'], [4, 7, 8, 1, '#5b7a45'], [7, 8, 2, 4, '#2a3a24'], [5, 13, 2, 2, '#4a3320'], [9, 13, 2, 2, '#4a3320'], [5, 15, 2, 1, P.ink], [9, 15, 2, 1, P.ink],
    [13, 3, 1, 10, '#5b3a1a'], [14, 4, 1, 1, '#d8c79d'], [14, 11, 1, 1, '#d8c79d'], [14, 5, 1, 6, '#f2e6c4'], [1, 5, 2, 6, '#7a4a1e'], [1, 4, 1, 1, '#c9a061'], [2, 4, 1, 1, P.crimson]] },
  knight: { bg: P.paper, art: [[5, 0, 6, 1, P.crimson], [4, 1, 8, 6, '#8d9199'], [5, 3, 6, 1, '#2a2a30'], [7, 3, 2, 4, '#2a2a30'], [4, 7, 8, 6, '#8d9199'], [4, 8, 8, 5, '#efe3c4'], [7, 8, 2, 5, P.crimson], [5, 10, 6, 2, P.crimson],
    [3, 7, 2, 2, '#6c7078'], [11, 7, 2, 2, '#6c7078'], [3, 9, 1, 3, '#8d9199'], [12, 9, 1, 3, '#8d9199'], [5, 13, 2, 2, '#6c7078'], [9, 13, 2, 2, '#6c7078'], [5, 15, 2, 1, P.ink], [9, 15, 2, 1, P.ink],
    [13, 0, 1, 9, '#d7dae0'], [12, 9, 3, 1, '#c9a061'], [13, 10, 1, 2, '#5b3a1a'], [0, 7, 3, 5, '#f2e6c4'], [0, 7, 3, 1, P.crimson], [1, 8, 1, 4, P.crimson], [0, 11, 3, 1, P.crimson]] },
  paladin: { bg: '#cdb98d', art: [[7, 0, 2, 1, '#4a2a6a'], [6, 1, 4, 1, '#4a2a6a'], [5, 2, 6, 1, '#4a2a6a'], [4, 3, 8, 1, '#3a1f55'], [6, 3, 4, 1, P.crimson], [5, 4, 6, 3, P.skin], [6, 4, 1, 1, P.ink], [9, 4, 1, 1, P.ink],
    [5, 6, 6, 3, '#f4efe2'], [6, 7, 4, 3, '#f4efe2'], [4, 8, 8, 7, '#4a2a6a'], [7, 9, 2, 6, '#3a1f55'], [4, 9, 8, 1, '#c9a061'], [3, 8, 1, 3, '#4a2a6a'], [12, 8, 1, 3, '#4a2a6a'],
    [4, 15, 8, 1, P.ink], [2, 3, 1, 12, '#5b3a1a'], [1, 1, 3, 3, '#9ee6ff'], [2, 2, 1, 1, '#fff'], [13, 2, 1, 1, '#c9a061'], [14, 5, 1, 1, '#c9a061'], [0, 6, 1, 1, '#c9a061'], [13, 10, 2, 2, P.crimson]] },
};
// ---------- BRUTALIST ----------
const B = { y: '#ffd400', r: '#e4252b', b: '#0a63e8', w: '#fffaf0', skin: '#f2b27a' };
const brutOutline = (rects: R[]): R[] => [...rects.map(([x, y, w, h]): R => [x - 0.5, y - 0.5, w + 1, h + 1, K]), ...rects];
const BRUT: Record<AvatarKey, Skin> = {
  novice: { bg: '#fff1b0', frame: K, art: brutOutline([[5, 2, 6, 5, B.skin], [5, 7, 6, 5, B.b], [3, 8, 2, 3, B.skin], [11, 8, 2, 3, B.skin], [5, 12, 2, 3, K], [9, 12, 2, 3, K]]).concat([[5, 2, 6, 1, B.r], [11, 3, 2, 1, B.r], [6, 4, 1, 1, K], [9, 4, 1, 1, K], [7, 6, 2, 1, K]]) },
  squire: { bg: '#fff1b0', frame: K, art: brutOutline([[5, 1, 6, 5, B.skin], [4, 6, 8, 6, B.w], [0, 7, 4, 4, B.r], [12, 7, 4, 4, B.r], [5, 12, 2, 3, B.b], [9, 12, 2, 3, B.b]]).concat([[5, 1, 6, 1, B.r], [5, 2, 6, 1, K], [6, 3, 1, 1, K], [9, 3, 1, 1, K], [6, 5, 4, 1, K], [4, 6, 8, 1, B.y], [7, 8, 2, 3, B.r]]) },
  knight: { bg: '#fff1b0', frame: K, art: brutOutline([[5, 2, 6, 5, B.skin], [3, 7, 10, 5, B.r], [1, 5, 2, 5, B.skin], [13, 2, 2, 5, B.skin], [4, 12, 3, 3, K], [9, 12, 3, 3, K], [13, 0, 2, 2, B.y]]).concat([[3, 10, 10, 1, B.y], [6, 10, 4, 2, B.y], [6, 4, 1, 1, K], [9, 4, 1, 1, K], [6, 6, 4, 1, K], [5, 2, 6, 1, B.b], [4, 8, 2, 1, B.w], [10, 8, 2, 1, B.w]]) },
  paladin: { bg: '#ffd400', frame: K, art: brutOutline([[4, 0, 1, 3, B.r], [11, 0, 1, 3, B.r], [4, 2, 8, 5, B.b], [2, 7, 12, 6, K], [0, 6, 3, 3, B.y], [13, 6, 3, 3, B.y], [0, 9, 3, 4, B.r], [13, 9, 3, 4, B.r], [4, 13, 3, 3, B.b], [9, 13, 3, 3, B.b]]).concat([[4, 4, 8, 1, '#111'], [5, 3, 6, 1, B.y], [5, 6, 6, 1, B.w], [6, 6, 1, 1, K], [9, 6, 1, 1, K], [4, 8, 8, 1, B.y], [6, 9, 4, 3, B.r], [7, 10, 2, 1, B.w]]) },
};
// ---------- COZY ----------
const Z = { skin: '#ffd9bf', blush: '#ff9fb2', ink: '#4a3a5c' };
const cozyFace = (): R[] => [[5, 3, 6, 5, Z.skin], [4, 4, 8, 3, Z.skin], [5, 5, 1, 2, Z.ink], [10, 5, 1, 2, Z.ink], [5, 7, 1, 1, Z.blush], [10, 7, 1, 1, Z.blush], [7, 7, 2, 1, '#e86a7a']];
const COZY: Record<AvatarKey, Skin> = {
  novice: { bg: '#f1eaff', art: [[5, 1, 6, 2, '#a0643c'], [4, 2, 8, 2, '#a0643c'], [7, 0, 2, 1, '#a0643c'], ...cozyFace(), [4, 8, 8, 5, '#ff9f80'], [5, 8, 6, 1, '#fff7ef'], [5, 10, 6, 3, '#fff7ef'], [3, 9, 1, 3, Z.skin], [12, 9, 1, 3, Z.skin], [5, 13, 2, 2, '#7a5a8a'], [9, 13, 2, 2, '#7a5a8a'], [12, 12, 3, 3, '#c9a061'], [12, 11, 3, 1, '#8aa0e0']] },
  squire: { bg: '#e6f8ee', art: [[2, 2, 12, 1, '#f5d37a'], [4, 0, 8, 2, '#f5d37a'], [4, 1, 8, 1, '#ff8fb0'], [10, 0, 2, 2, '#ff8fb0'], [11, 0, 1, 1, '#fff7ef'], ...cozyFace().slice(0), [4, 8, 8, 5, '#58c4a0'], [4, 8, 2, 3, '#fff7ef'], [10, 8, 2, 3, '#fff7ef'], [3, 9, 1, 3, Z.skin], [12, 9, 1, 3, Z.skin], [5, 13, 2, 2, '#8a6a4a'], [9, 13, 2, 2, '#8a6a4a'],
    [13, 10, 3, 3, '#6aa7e8'], [13, 9, 3, 1, '#6aa7e8'], [15, 10, 1, 1, '#bfe3ff'], [0, 12, 1, 3, '#58c4a0'], [1, 11, 1, 1, '#ff8fb0']] },
  knight: { bg: '#ffeadb', art: [[4, 1, 8, 2, '#8c5a3c'], [3, 2, 1, 3, '#8c5a3c'], [4, 3, 8, 1, '#8c5a3c'], [4, 3, 8, 1, '#ffd35c'], ...cozyFace(), [4, 3, 3, 1, '#7ad0e8'], [9, 3, 3, 1, '#7ad0e8'],
    [4, 8, 8, 1, '#e8643a'], [4, 9, 8, 4, '#8c68e0'], [2, 8, 3, 6, '#ffb88a'], [2, 8, 3, 1, '#ffd9b8'], [3, 9, 1, 3, Z.skin], [12, 9, 1, 3, Z.skin], [5, 13, 2, 2, '#4a3a5c'], [9, 13, 2, 2, '#4a3a5c'], [12, 11, 3, 3, '#ffd35c'], [13, 12, 1, 1, '#e8643a'], [13, 2, 1, 5, '#8c5a3c'], [14, 2, 1, 2, '#58c4a0']] },
  paladin: { bg: '#d9ccff', glow: '#fff7ef', art: [[0, 5, 3, 2, '#fff7ef'], [0, 4, 2, 1, '#fff7ef'], [13, 5, 3, 2, '#fff7ef'], [14, 4, 2, 1, '#fff7ef'], [1, 7, 3, 1, '#ffd9f0'], [12, 7, 3, 1, '#ffd9f0'],
    [4, 0, 8, 1, '#8c68e0'], [3, 1, 10, 3, '#8c68e0'], [5, 3, 6, 1, '#8c68e0'], [7, 0, 2, 1, '#ffd35c'], ...cozyFace().slice(0).map((r): R => (r[1] === 3 ? [r[0], 4, r[2], r[3] - 1, r[4]] : r)),
    [4, 8, 8, 6, '#fff7ef'], [3, 9, 2, 5, '#fff7ef'], [11, 9, 2, 5, '#fff7ef'], [5, 14, 6, 1, '#ffd9f0'], [6, 10, 4, 2, '#ffd35c'], [7, 10, 2, 1, '#fff7ef'],
    [14, 1, 1, 8, '#c9a061'], [13, 0, 3, 2, '#ffd35c'], [14, 0, 1, 1, '#fff'], [1, 1, 1, 1, '#ffd35c'], [2, 12, 1, 1, '#ffd35c'], [14, 12, 1, 1, '#9ee6ff']] },
};
// ---------- RETRO (original art lives in the components) ----------
const SKINS: Record<Exclude<SkinTheme, 'retro'>, Record<AvatarKey, Skin>> = { anime: ANIME, cyberpunk: CYBER, parchment: PARCH, brutalist: BRUT, cozy: COZY };
export const skinFor = (theme: SkinTheme, id: AvatarKey): Skin | null => (theme === 'retro' ? null : SKINS[theme][id]);

export const AVATAR_LABELS: Record<SkinTheme, Record<AvatarKey, { name: string; role: string }>> = {
  retro: { novice: { name: '', role: '' }, squire: { name: '', role: '' }, knight: { name: '', role: '' }, paladin: { name: '', role: '' } },
  anime: { novice: { name: 'Recruit', role: 'Awakened rank E' }, squire: { name: 'Shadow Hunter', role: 'Gate stalker' }, knight: { name: 'Elite Blade', role: 'S-rank swordsman' }, paladin: { name: 'Aura Monarch', role: 'Legendary sovereign' } },
  cyberpunk: { novice: { name: 'Runner', role: 'Street courier' }, squire: { name: 'Netrunner', role: 'Deck jockey' }, knight: { name: 'Armored Enforcer', role: 'Corp breaker' }, paladin: { name: 'Neon Overlord', role: 'Grid sovereign' } },
  parchment: { novice: { name: 'Traveler', role: 'Wandering pilgrim' }, squire: { name: 'Ranger', role: 'Warden of the wood' }, knight: { name: 'Knight', role: 'Sworn blade' }, paladin: { name: 'Archmage', role: 'Keeper of the tome' } },
  brutalist: { novice: { name: 'Arcade Rookie', role: 'Fresh quarter' }, squire: { name: 'Brawler', role: 'Combo starter' }, knight: { name: 'Champion', role: 'Belt holder' }, paladin: { name: 'The Boss', role: 'Final cabinet' } },
  cozy: { novice: { name: 'Villager', role: 'Neighborly beginner' }, squire: { name: 'Gardener', role: 'Keeper of sprouts' }, knight: { name: 'Explorer', role: 'Trail-happy scout' }, paladin: { name: 'Dream Guardian', role: 'Friendly protector' } },
};
export const themedLabel = (theme: SkinTheme, id: AvatarKey, fallback: { name: string; role: string }) => (theme === 'retro' ? fallback : AVATAR_LABELS[theme][id]);
