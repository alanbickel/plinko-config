// Board sizing (site/internals/sizing.md): fill the host's width, but never be taller than the
// screen, nor than the host if it has a height of its own. Centred when narrower than the host.

import type { BoardContext } from './context';

const FALLBACK_WIDTH = 300;
/** The root font size when the ruler measures nothing (no layout, as in jsdom): the default. */
const DEFAULT_REM_PX = 16;

export interface FitInput {
  /** Width available, CSS pixels. */
  available: number;
  /** Height the canvas may use; Infinity when nothing limits it. */
  roomHeight: number;
  /** The canvas's CSS height at a CSS width. */
  heightAt: (width: number) => number;
}

export function fitToHost(ctx: BoardContext): void {
  const { canvas, wrapper } = ctx.dom;
  // Collapse the canvas for a moment: whatever height the host keeps then is its own.
  canvas.style.height = '0px';
  const remPx = remOf(ctx);
  const width = fitWidth({
    available: wrapper.clientWidth || FALLBACK_WIDTH,
    roomHeight: Math.min(hostRoom(ctx), screenRoom(ctx)),
    heightAt: (cssWidth) => ctx.view.heightAt({ cssWidth, remPx }),
  });
  const dpr = ctx.win?.devicePixelRatio || 1;
  const height = ctx.view.resize({ cssWidth: width, remPx, dpr });
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  if (ctx.dom.attribution) ctx.dom.attribution.style.width = `${width}px`;
  ctx.loop.redraw();
}

/** The root font size, CSS pixels, from the 1rem ruler: what rem-sized canvas text is sized from. */
function remOf({ dom }: BoardContext): number {
  const size = dom.remRuler.getBoundingClientRect().width;
  return size > 0 ? size : DEFAULT_REM_PX;
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

/** No canvas is narrower than this, CSS pixels, even when nothing fits the room. */
const MIN_WIDTH = 1;
/** Halvings of the width: far finer than a pixel at any screen size. */
const FIT_STEPS = 24;

/**
 * The widest canvas, up to the available width, whose height fits the room. Height grows with
 * width, but not in proportion (rem-sized text strips don't scale with the board), so the width is
 * found by halving rather than from an aspect ratio.
 */
export function fitWidth({ available, roomHeight, heightAt }: FitInput): number {
  if (heightAt(available) <= roomHeight) return available;
  let [lo, hi] = [Math.min(MIN_WIDTH, available), available];
  for (let i = 0; i < FIT_STEPS; i++) {
    const mid = (lo + hi) / 2;
    [lo, hi] = heightAt(mid) <= roomHeight ? [mid, hi] : [lo, mid];
  }
  return lo;
}
