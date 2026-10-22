import { useEffect, useRef, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import type { RpgSnapshot } from '@workspace/api-client-react';
import { AchievementCardPreview, type AchievementCardAspect } from '@/components/achievement-card-preview';
import type { ShareMilestone } from '@/lib/share-milestones';
import { THEME_META, type ThemeId } from '@/lib/theme';

interface AchievementShareDialogProps {
  milestone: ShareMilestone;
  snapshot: RpgSnapshot;
  themeId: ThemeId;
  onClose: () => void;
}

const outputSize: Record<AchievementCardAspect, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1800, height: 1800 },
};

function createPngFile(svgNode: SVGSVGElement, aspect: AchievementCardAspect, headline: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const { width, height } = outputSize[aspect];
    const svgMarkup = new XMLSerializer().serializeToString(svgNode);
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(svgBlob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Your browser could not create the image canvas.'));
        return;
      }
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('The PNG could not be generated. Please try again.'));
          return;
        }
        const safeName = headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'milestone';
        resolve(new File([blob], `pixel-quest-${safeName}-${aspect}.png`, { type: 'image/png' }));
      }, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The card preview could not be rendered. Please try again.'));
    };
    image.src = objectUrl;
  });
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function AchievementShareDialog({ milestone, snapshot, themeId, onClose }: AchievementShareDialogProps) {
  const [aspect, setAspect] = useState<AchievementCardAspect>('story');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cardRef = useRef<SVGSVGElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const meta = THEME_META[themeId];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) closeRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy]);

  async function exportFile() {
    if (!cardRef.current) throw new Error('The preview is not ready yet.');
    return createPngFile(cardRef.current, aspect, milestone.headline);
  }

  async function downloadPng() {
    setBusy(true);
    setError('');
    try {
      const file = await exportFile();
      downloadFile(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The PNG could not be downloaded. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function shareOrDownload() {
    setBusy(true);
    setError('');
    try {
      const file = await exportFile();
      const shareData: ShareData = { files: [file], title: milestone.headline, text: `${milestone.headline} — Pixel Quest` };
      if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share(shareData);
      } else {
        downloadFile(file);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'Sharing failed. Please try downloading the PNG instead.');
    } finally {
      setBusy(false);
    }
  }

  const canShareFiles = typeof navigator !== 'undefined'
    && typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-[color:var(--pq-bg)]/85 p-3 backdrop-blur-sm sm:p-6"
      data-testid="dialog-achievement-share-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="achievement-share-title"
        className="pixel-border my-auto grid w-full max-w-4xl overflow-hidden bg-[color:var(--pq-panel)] md:grid-cols-[minmax(0,1fr)_310px]"
        data-testid="dialog-achievement-share"
      >
        <div className="min-w-0 p-4 sm:p-6">
          <header className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[.2em] text-[color:var(--pq-cyan)]">Make it a moment</p>
              <h2 id="achievement-share-title" className="pixel-title text-[11px] text-[color:var(--pq-ink)] sm:text-[13px]">Share your milestone</h2>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close achievement share dialog" data-testid="button-close-achievement-share" className="grid h-9 w-9 shrink-0 place-items-center border border-[color:var(--pq-line)] text-[color:var(--pq-mute2)] transition-colors hover:text-[color:var(--pq-gold)] disabled:opacity-50">
              <X size={17} />
            </button>
          </header>
          <div className="flex min-h-[340px] items-center justify-center border border-[color:var(--pq-line3)] bg-[color:var(--pq-bg)]/60 p-3 sm:min-h-[450px] sm:p-5" data-testid="preview-frame">
            <div className="w-full max-w-[290px] sm:max-w-[310px]">
              <AchievementCardPreview ref={cardRef} milestone={milestone} snapshot={snapshot} themeId={themeId} aspect={aspect} />
            </div>
          </div>
          <p className="mt-3 text-center font-mono text-[9px] text-[color:var(--pq-mute)]" data-testid="text-active-theme">
            {meta.name} theme · exported at full resolution
          </p>
        </div>

        <aside className="flex flex-col border-t border-[color:var(--pq-line)] bg-[color:var(--pq-panel2)] p-4 sm:p-6 md:border-l md:border-t-0">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[color:var(--pq-mute)]">01 / Format</p>
            <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Card format">
              {(['story', 'square'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  aria-pressed={aspect === format}
                  onClick={() => { setAspect(format); setError(''); }}
                  data-testid={`button-format-${format}`}
                  className={`border px-3 py-3 text-left transition-colors ${aspect === format ? 'border-[color:var(--pq-gold)] bg-[color:var(--pq-panel)] text-[color:var(--pq-ink)]' : 'border-[color:var(--pq-line3)] text-[color:var(--pq-mute)] hover:border-[color:var(--pq-line)]'}`}
                >
                  <span className="block text-xs font-bold">{format === 'story' ? 'Story' : 'Square'}</span>
                  <span className="mt-1 block font-mono text-[9px] opacity-70">{format === 'story' ? '9:16 · 1080 × 1920' : '1:1 · 1800 × 1800'}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 border-t border-[color:var(--pq-line3)] pt-5">
            <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[color:var(--pq-mute)]">02 / Your card</p>
            <p className="mt-3 text-sm font-bold text-[color:var(--pq-ink)]" data-testid="text-milestone-headline">{milestone.headline}</p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--pq-mute)]">{milestone.detail}</p>
          </div>

          <div className="mt-auto pt-6">
            {error && <p role="alert" data-testid="status-share-error" className="mb-3 border border-[color:var(--pq-danger)]/50 bg-[color:var(--pq-bg)] px-3 py-2 text-xs leading-relaxed text-[color:var(--pq-danger)]">{error}</p>}
            {busy && <p role="status" aria-live="polite" data-testid="status-share-busy" className="mb-3 flex items-center gap-2 text-xs text-[color:var(--pq-cyan)]"><span className="h-3 w-3 animate-pulse border border-current" />Preparing your card…</p>}
            {canShareFiles && (
              <button type="button" onClick={shareOrDownload} disabled={busy} data-testid="button-share-achievement" className="pixel-button mb-2 flex w-full items-center justify-center gap-2 border-2 border-black/20 bg-[color:var(--pq-gold)] px-4 py-3 text-sm font-bold text-[color:var(--pq-onaccent)] disabled:cursor-wait disabled:opacity-60">
                <Share2 size={16} /> {busy ? 'Preparing…' : 'Share card'}
              </button>
            )}
            <button type="button" onClick={downloadPng} disabled={busy} data-testid="button-download-achievement" className="pixel-button flex w-full items-center justify-center gap-2 border-2 border-[color:var(--pq-line)] bg-[color:var(--pq-panel)] px-4 py-3 text-sm font-bold text-[color:var(--pq-ink)] disabled:cursor-wait disabled:opacity-60">
              <Download size={16} /> Download PNG
            </button>
            <p className="mt-3 text-center text-[10px] leading-relaxed text-[color:var(--pq-mute)]">
              {canShareFiles ? 'Share directly or save a crisp PNG.' : 'A high-resolution PNG will download to your device.'}
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
