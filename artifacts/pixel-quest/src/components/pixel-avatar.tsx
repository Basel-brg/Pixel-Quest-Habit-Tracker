import type { AvatarId } from '@workspace/api-client-react';

type R = [number, number, number, number, string];
const skin = '#f0c29a', hair = '#6b4a35', out = '#1b1930';
const base = (cloth: string, trim: string): R[] => [
  [5, 2, 6, 1, hair], [5, 3, 6, 4, skin], [5, 3, 1, 1, hair], [10, 3, 1, 1, hair], [6, 4, 1, 1, out], [9, 4, 1, 1, out], [7, 6, 2, 1, '#c98b6b'],
  [4, 8, 8, 4, cloth], [4, 8, 8, 1, trim], [3, 8, 1, 3, cloth], [12, 8, 1, 3, cloth], [3, 11, 1, 1, skin], [12, 11, 1, 1, skin],
  [5, 12, 2, 3, '#4a3b5c'], [9, 12, 2, 3, '#4a3b5c'], [5, 15, 2, 1, out], [9, 15, 2, 1, out],
];
const art: Record<AvatarId, R[]> = {
  novice: [...base('#8a6f4e', '#b99a6b'), [2, 6, 1, 8, '#7a5a3a'], [1, 5, 3, 1, '#9b9ba8']],
  squire: [...base('#9b6a3f', '#f5ca62'), [6, 9, 4, 2, '#7d5230'], [13, 4, 1, 7, '#c9a061'], [13, 3, 1, 1, '#e8d7aa'], [12, 11, 3, 1, '#7a5a3a']],
  knight: [[2, 8, 1, 7, '#b0344a'], [3, 12, 1, 3, '#b0344a'], [4, 2, 8, 1, '#cfd6e6'], [4, 3, 8, 4, '#9aa4ba'], [5, 4, 6, 1, out], [7, 2, 2, 1, '#b0344a'],
    [4, 7, 8, 5, '#cfd6e6'], [4, 8, 8, 1, '#9aa4ba'], [3, 7, 2, 2, '#9aa4ba'], [11, 7, 2, 2, '#9aa4ba'], [5, 12, 2, 3, '#7d879e'], [9, 12, 2, 3, '#7d879e'], [5, 15, 2, 1, out], [9, 15, 2, 1, out],
    [12, 8, 3, 4, '#2d5fa8'], [13, 9, 1, 2, '#f5ca62'], [13, 12, 1, 1, '#2d5fa8']],
  paladin: [[0, 3, 3, 1, '#fff2b8'], [0, 4, 4, 2, '#fff2b8'], [1, 6, 3, 1, '#fff2b8'], [13, 3, 3, 1, '#fff2b8'], [12, 4, 4, 2, '#fff2b8'], [12, 6, 3, 1, '#fff2b8'],
    [5, 0, 1, 1, '#f5ca62'], [7, 0, 2, 1, '#f5ca62'], [10, 0, 1, 1, '#f5ca62'], [5, 1, 6, 1, '#f5ca62'],
    [5, 2, 6, 5, '#f5e7c8'], [6, 4, 1, 1, '#73e6df'], [9, 4, 1, 1, '#73e6df'],
    [4, 7, 8, 5, '#f5ca62'], [7, 8, 2, 3, '#73e6df'], [3, 7, 2, 2, '#ffe28a'], [11, 7, 2, 2, '#ffe28a'], [5, 12, 2, 3, '#d9a93f'], [9, 12, 2, 3, '#d9a93f'], [5, 15, 2, 1, out], [9, 15, 2, 1, out]],
};
export function PixelAvatar({ id, size = 96, locked = false, testId }: { id: AvatarId; size?: number; locked?: boolean; testId?: string }) {
  return <svg data-testid={testId} role="img" aria-label={`${id} avatar`} viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges" style={{ filter: locked ? 'grayscale(1) brightness(.5)' : undefined }}>
    <rect width="16" height="16" fill="#252238"/>
    {id === 'paladin' && <rect x="2" y="1" width="12" height="14" fill="#f5ca62" opacity=".12"/>}
    {art[id].map(([x, y, w, h, fill], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={fill}/>)}
  </svg>;
}
