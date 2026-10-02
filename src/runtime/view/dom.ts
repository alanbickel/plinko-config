// The few DOM nodes the board needs besides the canvas. Everything is created inside one wrapper,
// styled inline (no stylesheet is injected into the host page), and removed with it.

import type { Labels } from '../labels';

const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;' +
  'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0';
const ATTRIBUTION_URL = 'https://github.com/KilledByAPixel/LittleJS';

let instance = 0;

export interface BoardDom {
  wrapper: HTMLDivElement;
  canvas: HTMLCanvasElement;
  live: HTMLDivElement;
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
  const live = createLiveRegion(make);
  wrapper.append(canvas, createInstructions(make), live);
  const link = attribution ? createAttribution(make) : undefined;
  if (link) wrapper.append(link);
  host.append(wrapper);
  return { wrapper, canvas, live, attribution: link };
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
  canvas.setAttribute('aria-roledescription', 'game');
  canvas.setAttribute('aria-label', labels.board);
  canvas.setAttribute('aria-describedby', `${id}-instructions`);
  canvas.style.cssText = 'display:block;margin:0 auto;touch-action:none';
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
  link.style.cssText = 'display:block;margin-top:0.25em;font-size:0.75em;text-align:right';
  return link;
}
