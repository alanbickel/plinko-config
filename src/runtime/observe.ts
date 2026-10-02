// Size and visibility observers. Both are optional: environments without them just don't refit
// or pause.

import type { BoardContext } from './context';
import { fitToHost } from './sizing';

/** Observes size and visibility; returns a function that stops observing. */
export function observeHost(ctx: BoardContext): () => void {
  const resize = observeSize(ctx);
  const visibility = observeVisibility(ctx);
  return () => {
    resize?.disconnect();
    visibility?.disconnect();
  };
}

/** Pauses when the host asked to or the board is off-screen; otherwise runs. */
export function applyPause({ ui, loop }: BoardContext): void {
  if (ui.pausedByHost || ui.offscreen) {
    loop.pause();
    return;
  }
  loop.resume();
}

function observeSize(ctx: BoardContext): ResizeObserver | undefined {
  if (typeof ResizeObserver === 'undefined') return undefined;
  const observer = new ResizeObserver(() => fitToHost(ctx));
  observer.observe(ctx.dom.wrapper);
  observer.observe(ctx.host);
  return observer;
}

function observeVisibility(ctx: BoardContext): IntersectionObserver | undefined {
  if (typeof IntersectionObserver === 'undefined') return undefined;
  const observer = new IntersectionObserver(([entry]) => {
    ctx.ui.offscreen = entry ? !entry.isIntersecting : false;
    applyPause(ctx);
  });
  observer.observe(ctx.dom.wrapper);
  return observer;
}
