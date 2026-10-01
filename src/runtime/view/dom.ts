// The few DOM nodes the board needs besides the canvas. Everything is created inside one wrapper,
// styled inline (no stylesheet is injected into the host page), and removed with it.

import type { Labels } from '../labels';

const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;' +
  'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0';

let instance = 0;

export interface BoardDom {
  wrapper: HTMLDivElement;
  canvas: HTMLCanvasElement;
  live: HTMLDivElement;
  attribution: HTMLAnchorElement | undefined;
}

export function createDom(target: HTMLElement, labels: Labels, attribution: boolean): BoardDom {
  const id = `plinko-config-${++instance}`;
  const doc = target.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Partial<HTMLElementTagNameMap[K]> = {},
  ) => Object.assign(doc.createElement(tag), props);

  const wrapper = el('div', { className: 'plinko-config' });
  wrapper.setAttribute('part', 'board');
  wrapper.style.cssText = 'position:relative;width:100%';

  const canvas = el('canvas', { tabIndex: 0 });
  canvas.setAttribute('part', 'canvas');
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', 'game');
  canvas.setAttribute('aria-label', labels.board);
  canvas.setAttribute('aria-describedby', `${id}-instructions`);
  canvas.style.cssText = 'display:block;margin:0 auto;touch-action:none';

  const instructions = el('p', { id: `${id}-instructions`, textContent: labels.instructions });
  instructions.style.cssText = VISUALLY_HIDDEN;

  const live = el('div');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  live.className = 'plinko-config-live';
  live.style.cssText = VISUALLY_HIDDEN;

  wrapper.append(canvas, instructions, live);

  let link: HTMLAnchorElement | undefined;
  if (attribution) {
    link = el('a', {
      href: 'https://github.com/KilledByAPixel/LittleJS',
      textContent: labels.attribution,
      rel: 'noopener',
      target: '_blank',
    });
    link.setAttribute('part', 'attribution');
    link.style.cssText = 'display:block;margin-top:0.25em;font-size:0.75em;text-align:right';
    wrapper.append(link);
  }

  target.append(wrapper);
  return { wrapper, canvas, live, attribution: link };
}
