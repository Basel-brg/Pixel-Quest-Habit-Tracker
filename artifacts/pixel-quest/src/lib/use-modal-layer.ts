import { useLayoutEffect, useRef, type RefObject } from 'react';

type Layer = { overlay: HTMLElement; dialog: HTMLElement };
const layers: Layer[] = [];
const inertBefore = new Map<HTMLElement, boolean>();
let scrollBefore: { body: string; html: string; paddingRight: string } | null = null;

function syncBackground() {
  const top = layers.at(-1);
  for (const child of document.body.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (!inertBefore.has(child)) inertBefore.set(child, child.inert);
    child.inert = child === top?.overlay ? false : true;
  }
}

function focusable(dialog: HTMLElement) {
  return [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]')]
    .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[inert], [hidden]') &&
      el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
}

/** A body-level modal owns scrolling and focus until the top layer is dismissed. */
export function useModalLayer(
  overlayRef: RefObject<HTMLDivElement | null>,
  dialogRef: RefObject<HTMLDivElement | null>,
  onClose: () => void,
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const overlay = overlayRef.current, dialog = dialogRef.current;
    if (!overlay || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const layer = { overlay, dialog };
    if (!layers.length) {
      scrollBefore = { body: document.body.style.overflow, html: document.documentElement.style.overflow, paddingRight: document.body.style.paddingRight };
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbar > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
    layers.push(layer);
    // Move focus before making its previous ancestor inert.
    dialog.focus({ preventScroll: true });
    syncBackground();

    const isTop = () => layers.at(-1) === layer;
    const keydown = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault(); e.stopPropagation(); closeRef.current();
      } else if (e.key === 'Tab') {
        const targets = focusable(dialog), first = targets[0], last = targets.at(-1);
        const active = document.activeElement;
        if (!first) { e.preventDefault(); dialog.focus({ preventScroll: true }); }
        else if (e.shiftKey && (active === first || !dialog.contains(active) || active === dialog)) {
          e.preventDefault(); last!.focus();
        } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
          e.preventDefault(); first.focus();
        }
      }
    };
    const focusin = (e: FocusEvent) => {
      if (isTop() && e.target instanceof Node && !dialog.contains(e.target)) dialog.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    return () => {
      const wasTop = isTop();
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      layers.splice(layers.indexOf(layer), 1);
      if (layers.length) syncBackground();
      else {
        for (const [element, inert] of inertBefore) element.inert = inert;
        inertBefore.clear();
        if (scrollBefore) {
          document.body.style.overflow = scrollBefore.body;
          document.documentElement.style.overflow = scrollBefore.html;
          document.body.style.paddingRight = scrollBefore.paddingRight;
          scrollBefore = null;
        }
      }
      if (wasTop) {
        const target = previousFocus?.isConnected && !previousFocus.closest('[inert]') ? previousFocus : layers.at(-1)?.dialog;
        target?.focus({ preventScroll: true });
      }
    };
  }, [overlayRef, dialogRef]);
}
