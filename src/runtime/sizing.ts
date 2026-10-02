// Board sizing (ARCHITECTURE.md §7): fill the host's width; if the host has a height of its own,
// fit inside it too, centred.

import type { BoardContext } from './context';

const FALLBACK_WIDTH = 300;

interface FitInput {
  /** Width available, CSS pixels. */
  available: number;
  /** Height the host leaves for the canvas; ≤ 1 when the host has no height of its own. */
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
    roomHeight: roomHeight(ctx),
    aspect: ctx.view.aspect,
  });
  const height = ctx.view.resize(width, ctx.win?.devicePixelRatio || 1);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.loop.redraw();
}

/** Host height left for the canvas, after padding and the wrapper's other content. */
function roomHeight({ host, win, dom }: BoardContext): number {
  const style = win?.getComputedStyle(host);
  const padding = style ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) : 0;
  return host.clientHeight - padding - dom.wrapper.offsetHeight;
}

function fitWidth({ available, roomHeight, aspect }: FitInput): number {
  return roomHeight > 1 ? Math.min(available, roomHeight * aspect) : available;
}
