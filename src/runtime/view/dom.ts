// The few DOM nodes the board needs besides the canvas. Everything is created inside one wrapper,
// styled inline (no stylesheet is injected into the host page), and removed with it.

import type { Labels } from '../labels';

const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;' +
  'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0';
/** Clips the screen ruler so its height never adds to the page's scrollable area. */
const RULER_BOX = 'position:absolute;top:0;left:0;width:0;height:0;overflow:hidden';
/** As tall as the screen with mobile browser bars shown (svh), so it doesn't change as they hide. */
const RULER = 'width:0;height:100vh;height:100svh;visibility:hidden';
const ATTRIBUTION_URL = 'https://github.com/KilledByAPixel/LittleJS';

let instance = 0;

export interface BoardDom {
  wrapper: HTMLDivElement;
  canvas: HTMLCanvasElement;
  /** Read once when the board gets focus (aria-describedby). */
  instructions: HTMLParagraphElement;
  live: HTMLDivElement;
  /** Measures the screen's height; observed instead of listening on window (no global listeners). */
  screenRuler: HTMLDivElement;
  attribution: HTMLAnchorElement | undefined;
}

export interface CreateDomInput {
  host: HTMLElement;
  labels: Labels;
  attribution: boolean;
}

/** What every element builder needs. */
interface Maker {
  doc: Document;
  /** Unique per board, for id references such as aria-describedby. */
  id: string;
  labels: Labels;
}

export function createDom({ host, labels, attribution }: CreateDomInput): BoardDom {
  const make: Maker = { doc: host.ownerDocument, id: `plinko-config-${++instance}`, labels };
  const wrapper = createWrapper(make);
  const canvas = createCanvas(make);
  const instructions = createInstructions(make);
  const live = createLiveRegion(make);
  const screenRuler = make.doc.createElement('div');
  screenRuler.style.cssText = RULER;
  const rulerBox = make.doc.createElement('div');
  rulerBox.setAttribute('aria-hidden', 'true');
  rulerBox.style.cssText = RULER_BOX;
  rulerBox.append(screenRuler);
  wrapper.append(canvas, instructions, live, rulerBox);
  const link = attribution ? createAttribution(make) : undefined;
  if (link) wrapper.append(link);
  host.append(wrapper);
  return { wrapper, canvas, instructions, live, screenRuler, attribution: link };
}

/** Puts new wording on the nodes that carry labels (board.update). */
export function applyLabels(dom: BoardDom, labels: Labels): void {
  dom.canvas.setAttribute('aria-label', labels.board);
  dom.canvas.setAttribute('aria-roledescription', labels.roleDescription);
  dom.instructions.textContent = labels.instructions;
  if (dom.attribution) dom.attribution.textContent = labels.attribution;
}

function createWrapper({ doc }: Maker): HTMLDivElement {
  const wrapper = doc.createElement('div');
  wrapper.className = 'plinko-config';
  wrapper.setAttribute('part', 'board');
  wrapper.style.cssText = 'position:relative;width:100%';
  return wrapper;
}

function createCanvas({ doc, id, labels }: Maker): HTMLCanvasElement {
  const canvas = doc.createElement('canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('part', 'canvas');
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', labels.roleDescription);
  canvas.setAttribute('aria-label', labels.board);
  canvas.setAttribute('aria-describedby', `${id}-instructions`);
  canvas.style.cssText = 'display:block;margin:0 auto;touch-action:none;user-select:none';
  return canvas;
}

function createInstructions({ doc, id, labels }: Maker): HTMLParagraphElement {
  const p = doc.createElement('p');
  p.id = `${id}-instructions`;
  p.textContent = labels.instructions;
  p.style.cssText = VISUALLY_HIDDEN;
  return p;
}

function createLiveRegion({ doc }: Maker): HTMLDivElement {
  const live = doc.createElement('div');
  live.className = 'plinko-config-live';
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  live.style.cssText = VISUALLY_HIDDEN;
  return live;
}

function createAttribution({ doc, labels }: Maker): HTMLAnchorElement {
  const link = doc.createElement('a');
  link.href = ATTRIBUTION_URL;
  link.textContent = labels.attribution;
  link.rel = 'noopener';
  link.target = '_blank';
  link.setAttribute('part', 'attribution');
  // Centred under the canvas like the canvas itself; sizing.ts gives it the canvas's width, so the
  // credit sits under the board's right edge however wide the host is.
  link.style.cssText = 'display:block;margin:0.25em auto 0;font-size:0.75em;text-align:right';
  return link;
}
