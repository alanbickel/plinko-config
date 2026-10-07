import type { Page } from '@playwright/test';

// Records every fillText the board makes: the text, its font, and where it lands. One synchronous
// paint is one batch, so a spec can read exactly the last frame without knowing how the board
// paints. Sizes and boxes come back in CSS pixels, relative to the canvas.

/** One fillText call, as the page saw it. */
interface RawText {
  batch: number;
  text: string;
  font: string;
  /** Current transform, device pixels: a, b, c, d, e, f. */
  m: number[];
  x: number;
  y: number;
  /** actualBoundingBox metrics in the current font (they include textAlign and textBaseline). */
  left: number;
  right: number;
  ascent: number;
  descent: number;
  /** CSS pixels per device pixel on the canvas. */
  cssPerDevice: number;
}

/** A drawn text in CSS pixels: its font size on screen and its (possibly rotated) box. */
export interface DrawnText {
  text: string;
  /** Font size on screen, CSS pixels. */
  size: number;
  /** Box corners, CSS pixels from the canvas's top left. */
  box: Point[];
}

export interface Point {
  x: number;
  y: number;
}

declare global {
  interface Window {
    __texts: RawText[];
  }
}

/** Installs the recorder; call before the page loads. */
export async function recordText(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const texts: RawText[] = [];
    window.__texts = texts;
    let batch = 0;
    let open = false;
    /** A new batch for the first call since the last microtask checkpoint. */
    const batchNow = () => {
      if (open) return batch;
      open = true;
      queueMicrotask(() => {
        open = false;
      });
      return ++batch;
    };
    const proto = CanvasRenderingContext2D.prototype;
    const fillText = proto.fillText;
    // Rest parameters: fillText's own signature (text, x, y, maxWidth?), passed through untouched.
    proto.fillText = function (...args: Parameters<typeof fillText>) {
      const [text, x, y] = args;
      const t = this.getTransform();
      const m = this.measureText(text);
      texts.push({
        batch: batchNow(),
        text,
        font: this.font,
        m: [t.a, t.b, t.c, t.d, t.e, t.f],
        x,
        y,
        left: m.actualBoundingBoxLeft,
        right: m.actualBoundingBoxRight,
        ascent: m.actualBoundingBoxAscent,
        descent: m.actualBoundingBoxDescent,
        cssPerDevice: this.canvas.getBoundingClientRect().width / this.canvas.width,
      });
      if (texts.length > 5000) texts.splice(0, texts.length - 1000);
      fillText.apply(this, args);
    };
  });
}

/** Waits for fonts and for the canvas to stop changing size, then returns the last frame's text. */
export async function lastFrameText(page: Page): Promise<DrawnText[]> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const sizeOf = (c: HTMLCanvasElement | null) => {
      const r = c?.getBoundingClientRect();
      return `${r?.width}x${r?.height}:${c?.width}x${c?.height}`;
    };
    const canvas = document.querySelector('canvas');
    let last = '';
    for (let stable = 0; stable < 3; last = sizeOf(canvas)) {
      await frame();
      stable = sizeOf(canvas) === last ? stable + 1 : 0;
    }
  });
  const raw = await page.evaluate(() => {
    const all = window.__texts;
    const batch = all.at(-1)?.batch;
    return all.filter((t) => t.batch === batch);
  });
  return raw.map(toCss);
}

function toCss(t: RawText): DrawnText {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = t.m;
  const px = Number(/([\d.]+)px/.exec(t.font)?.[1] ?? Number.NaN);
  const k = t.cssPerDevice;
  const map = (x: number, y: number): Point => ({
    x: (a * x + c * y + e) * k,
    y: (b * x + d * y + f) * k,
  });
  const [x0, x1] = [t.x - t.left, t.x + t.right];
  const [y0, y1] = [t.y - t.ascent, t.y + t.descent];
  return {
    text: t.text,
    size: px * Math.hypot(a, b) * k,
    box: [map(x0, y0), map(x1, y0), map(x1, y1), map(x0, y1)],
  };
}

// --- overlap (separating axis test for convex boxes) ------------------------------------------

/** Boxes may touch by this much, CSS pixels: glyph bounds round to whole pixels. */
const SLACK = 0.5;

/** Unit normals of a box's edges. */
const axesOf = (box: Point[]): Point[] =>
  box.map((u, i) => {
    const v = box[(i + 1) % box.length] as Point;
    const len = Math.hypot(v.x - u.x, v.y - u.y) || 1;
    return { x: (v.y - u.y) / len, y: (u.x - v.x) / len };
  });

interface BoxPair {
  p: Point[];
  q: Point[];
}

/** True if the boxes' shadows on the axis are apart, or overlap by no more than SLACK. */
function apartOn(axis: Point, { p, q }: BoxPair): boolean {
  const shadow = (box: Point[]) => box.map((pt) => pt.x * axis.x + pt.y * axis.y);
  const [ps, qs] = [shadow(p), shadow(q)];
  const gap = Math.max(Math.min(...qs) - Math.max(...ps), Math.min(...ps) - Math.max(...qs));
  return gap > -SLACK;
}

/** True if two convex boxes overlap by more than SLACK. */
export const overlaps = (boxes: BoxPair): boolean =>
  ![...axesOf(boxes.p), ...axesOf(boxes.q)].some((axis) => apartOn(axis, boxes));
