// <plinko-board>: the board as a custom element. Options go in through a property, outcomes come
// out as DOM events (each callback is also fired as a plinko-* event), and the element owns the
// board's lifecycle: it mounts when connected, remounts when a mount-only option changes, and
// destroys the board when disconnected.

import { createPlinko } from './board';
import type { MountOnlyOption, PlinkoBoard, PlinkoOptions } from './types';

/** Callbacks re-fired as events, and the event each becomes. */
const EVENTS = {
  onPickUp: 'plinko-pick-up',
  onDrop: 'plinko-drop',
  onPegHit: 'plinko-peg-hit',
  onLand: 'plinko-land',
  onMiss: 'plinko-miss',
  onFull: 'plinko-full',
  onSupplyChange: 'plinko-supply-change',
  onExhausted: 'plinko-exhausted',
} as const;

type EventCallback = keyof typeof EVENTS;

/** Events fired by <plinko-board>; each detail is what the matching callback receives. */
export type PlinkoBoardEventMap = {
  [K in EventCallback as (typeof EVENTS)[K]]: CustomEvent<
    Parameters<NonNullable<PlinkoOptions[K]>>[0]
  >;
};

const MOUNT_ONLY: readonly MountOnlyOption[] = [
  'slots',
  'chips',
  'board',
  'physics',
  'supply',
  'attribution',
];

const STYLE = ':host{display:block}div{height:100%}';

// Importing this module where there's no DOM (server rendering) must not throw.
const BaseElement = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

export class PlinkoBoardElement extends BaseElement {
  private config: PlinkoOptions | undefined;
  private current: PlinkoBoard | undefined;
  private readonly mountPoint: HTMLDivElement;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.mountPoint = document.createElement('div');
    root.append(style, this.mountPoint);
  }

  /** The board's options. Setting them updates the live board, or remounts it if needed. */
  get options(): PlinkoOptions | undefined {
    return this.config;
  }

  set options(next: PlinkoOptions | undefined) {
    const previous = this.config;
    this.config = next;
    this.apply(previous);
  }

  /** The live board's handle (drop(), supply, …); undefined while not mounted. */
  get board(): PlinkoBoard | undefined {
    return this.current;
  }

  connectedCallback(): void {
    this.apply(undefined);
  }

  disconnectedCallback(): void {
    this.unmount();
  }

  /** Mount, remount, or update, whichever the change needs. */
  private apply(previous: PlinkoOptions | undefined): void {
    if (!this.config || !this.isConnected) {
      this.unmount();
      return;
    }
    if (this.current && previous && !mountOnlyChanged(previous, this.config)) {
      this.current.update(liveOptions(withEvents(this, this.config)));
      return;
    }
    this.unmount();
    this.current = createPlinko(this.mountPoint, withEvents(this, this.config));
  }

  private unmount(): void {
    this.current?.destroy();
    this.current = undefined;
  }
}

/**
 * Compared by value, not identity: frameworks often rebuild the options object on every render,
 * and a remount would empty the piles each time.
 */
function mountOnlyChanged(previous: PlinkoOptions, next: PlinkoOptions): boolean {
  return MOUNT_ONLY.some((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
}

function liveOptions(options: PlinkoOptions): PlinkoOptions {
  const live = { ...options };
  for (const key of MOUNT_ONLY) delete live[key];
  return live;
}

/** Wraps each callback so it also fires its event. The host's own callback still runs. */
function withEvents(element: HTMLElement, options: PlinkoOptions): PlinkoOptions {
  const wrapped: PlinkoOptions = { ...options };
  for (const [callback, type] of Object.entries(EVENTS) as [EventCallback, string][]) {
    const own = options[callback] as ((details: unknown) => void) | undefined;
    const fire = (details: unknown) => {
      element.dispatchEvent(
        new CustomEvent(type, { detail: details, bubbles: true, composed: true }),
      );
      own?.(details);
    };
    Object.assign(wrapped, { [callback]: fire });
  }
  return wrapped;
}

/**
 * Registers the element under a tag name, once. Other names get their own subclass, since one
 * class can't be registered twice.
 */
export function definePlinkoBoard(tag = 'plinko-board'): void {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  const element = tag === 'plinko-board' ? PlinkoBoardElement : class extends PlinkoBoardElement {};
  customElements.define(tag, element);
}

declare global {
  interface HTMLElementTagNameMap {
    'plinko-board': PlinkoBoardElement;
  }
}
