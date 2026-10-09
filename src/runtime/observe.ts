// Size and visibility observers. The observers are optional: environments without them
// just don't refit or pause.

import type { BoardContext } from './context';
import { fitToHost } from './sizing';

/** Observes size and visibility; returns a function that stops observing. */
export function observeHost(ctx: BoardContext): () => void {
  const refit = deferredFit(ctx);
  const resize = observeSize(ctx, refit);
  const visibility = observeVisibility(ctx);
  return () => {
    resize?.disconnect();
    visibility?.disconnect();
    refit.cancel();
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

/** A refit on the next frame; repeated requests before then share it. */
interface DeferredFit {
  schedule(): void;
  cancel(): void;
}

/**
 * Refitting inside a ResizeObserver callback resizes what it observes when the host's height
 * follows the canvas, and the browser reports that as an error on the page. A frame later, it
 * doesn't.
 */
function deferredFit(ctx: BoardContext): DeferredFit {
  let frame: number | undefined;
  const run = () => {
    frame = undefined;
    fitToHost(ctx);
  };
  return {
    schedule: () => {
      frame ??= ctx.win?.requestAnimationFrame(run);
    },
    cancel: () => {
      if (frame !== undefined) ctx.win?.cancelAnimationFrame(frame);
    },
  };
}

function observeSize(ctx: BoardContext, refit: DeferredFit): ResizeObserver | undefined {
  if (typeof ResizeObserver === 'undefined') return undefined;
  const observer = new ResizeObserver(() => refit.schedule());
  observer.observe(ctx.dom.wrapper);
  observer.observe(ctx.host);
  // The board never outgrows the screen, so a change in screen height can mean a refit.
  observer.observe(ctx.dom.screenRuler);
  // The browser's text size setting changes the root font size, which canvas text is sized in.
  observer.observe(ctx.dom.remRuler);
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
