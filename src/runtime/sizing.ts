// Board sizing (ARCHITECTURE.md §7): fill the host's width, but never be taller than the screen,
// nor than the host if it has a height of its own. Centred when narrower than the host.

import type { BoardContext } from './context';

const FALLBACK_WIDTH = 300;

interface FitInput {
  /** Width available, CSS pixels. */
  available: number;
  /** Height the canvas may use; Infinity when nothing limits it. */
  roomHeight: number;
  /** Board width ÷ height. */
  aspect: number;
}

export function fitToHost(ctx: BoardContext): void {
  const { canvas, wrapper } = ctx.dom;
  // Collapse the canvas for a moment: whatever height the host keeps then is its own.
  canvas.style.height = '0px';
  const width = fitWidth({
    available: wrapper.clientWidth || FALLBACK_WIDTH,
    roomHeight: Math.min(hostRoom(ctx), screenRoom(ctx)),
    aspect: ctx.view.aspect,
  });
  const height = ctx.view.resize(width, ctx.win?.devicePixelRatio || 1);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  if (ctx.dom.attribution) ctx.dom.attribution.style.width = `${width}px`;
  ctx.loop.redraw();
}

/** Host height left for the canvas, after padding and the wrapper's other content. */
function hostRoom({ host, win, dom }: BoardContext): number {
  const style = win?.getComputedStyle(host);
  const padding = style ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) : 0;
  return usable(host.clientHeight - padding - dom.wrapper.offsetHeight);
}

/**
 * Screen height left for the canvas. Touch drags can't scroll the page (touch-action: none), so
 * the whole board, tray included, must fit on screen. The ruler is as tall as the screen with
 * mobile browser bars shown, so the board doesn't resize as they hide and show.
 */
function screenRoom({ dom }: BoardContext): number {
  return usable(dom.screenRuler.offsetHeight - dom.wrapper.offsetHeight);
}

/** A height of 1px or less means nothing measurable: no limit. */
const usable = (height: number) => (height > 1 ? height : Infinity);

function fitWidth({ available, roomHeight, aspect }: FitInput): number {
  return Math.min(available, roomHeight * aspect);
}
