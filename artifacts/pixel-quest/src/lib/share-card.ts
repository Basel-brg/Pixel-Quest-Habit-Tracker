import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AvatarId } from '@workspace/api-client-react';
import { PixelAvatar } from '@/components/pixel-avatar';

export interface CardData { username: string; avatarId: AvatarId; level?: number; streak?: number; reward?: string }
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));
export const CARD_W = 600; export const CARD_H = 340;
export function buildCardSvg(d: CardData): string {
  const avatar = renderToStaticMarkup(createElement(PixelAvatar, { id: d.avatarId, size: 180 }));
  const rows: [string, string][] = [];
  if (d.level !== undefined) rows.push(['LEVEL', String(d.level)]);
  if (d.streak !== undefined) rows.push(['BEST STREAK', `${d.streak} days`]);
  if (d.reward) rows.push(['LATEST REWARD', d.reward.slice(0, 28)]);
  const lines = rows.map(([k, v], i) => `<text x="270" y="${150 + i * 52}" font-size="13" fill="#8f89a5" letter-spacing="2">${esc(k)}</text><text x="270" y="${174 + i * 52}" font-size="22" font-weight="700" fill="#f5ca62">${esc(v)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" font-family="'Courier New', monospace">
<rect width="${CARD_W}" height="${CARD_H}" fill="#1b1930"/><rect x="6" y="6" width="${CARD_W - 12}" height="${CARD_H - 12}" fill="#211f33" stroke="#f5ca62" stroke-width="4"/>
<text x="34" y="52" font-size="14" fill="#73e6df" letter-spacing="3">PIXEL QUEST PLAYER CARD</text>
<g transform="translate(40,90)"><rect x="-6" y="-6" width="192" height="192" fill="#514967"/>${avatar}</g>
<text x="270" y="92" font-size="30" font-weight="700" fill="#f3e9cf">${esc(d.username)}</text>${lines}
<text x="34" y="${CARD_H - 22}" font-size="11" fill="#77718d">Habits turned into earned adventures</text></svg>`;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const downloadSvg = (svg: string) => download(new Blob([svg], { type: 'image/svg+xml' }), 'pixel-quest-card.svg');
export function downloadPng(svg: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = CARD_W * 2; c.height = CARD_H * 2;
      const g = c.getContext('2d'); if (!g) { reject(new Error('Canvas unavailable')); return; }
      g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob((b) => { if (b) { download(b, 'pixel-quest-card.png'); resolve(); } else reject(new Error('Could not render PNG')); }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not render card')); };
    img.src = url;
  });
}
