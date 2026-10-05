// <plinko-board>: the board as a custom element. Options go in through a property, outcomes come
// out as DOM events (each callback is also fired as a plinko-* event), and the element owns the
// board's lifecycle: it mounts when connected, remounts when a mount-only option changes, and
// destroys the board when disconnected.

import type { SupplySnapshot } from '../core/supply';
import { createPlinko } from './board';
import type {
  ChipDetails,
  DropDetails,
  FullDetails,
  LandDetails,
  MissDetails,
  MountOnlyOption,
  PegHitDetails,
  PlinkoBoard,
  PlinkoOptions,
} from './types';

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

/**
 * The DOM events `<plinko-board>` fires. Each one mirrors a callback in {@link PlinkoOptions}:
 * its `detail` is the object that callback receives. All of them bubble and cross shadow DOM
 * boundaries (`composed`), so you can listen on the element or any ancestor.
 *
 * `CV` and `SV` are the chip and slot value types, as in {@link PlinkoOptions}. Listeners added on
 * the element get these events typed; see {@link PlinkoBoardElement}.
 *
 * @example
 * ```ts
 * board.addEventListener('plinko-land', (event) => {
 *   const { chip, slot } = event.detail;
 *   savePreference(slot.id, chip.value);
 * });
 * ```
 */
export interface PlinkoBoardEventMap<CV = unknown, SV = unknown> {
  /** A chip was picked up from the tray. Mirrors {@link PlinkoOptions.onPickUp}. */
  'plinko-pick-up': CustomEvent<ChipDetails<CV>>;
  /** A chip was dropped from the drop zone and is falling. Mirrors {@link PlinkoOptions.onDrop}. */
  'plinko-drop': CustomEvent<DropDetails<CV>>;
  /** A falling chip hit a peg. Mirrors {@link PlinkoOptions.onPegHit}. */
  'plinko-peg-hit': CustomEvent<PegHitDetails<CV>>;
  /** A chip came to rest in a slot. Mirrors {@link PlinkoOptions.onLand}. */
  'plinko-land': CustomEvent<LandDetails<CV, SV>>;
  /** A chip came to rest without reaching a slot. Mirrors {@link PlinkoOptions.onMiss}. */
  'plinko-miss': CustomEvent<MissDetails<CV>>;
  /** The board filled up and locked. Fires once. Mirrors {@link PlinkoOptions.onFull}. */
  'plinko-full': CustomEvent<FullDetails>;
  /** Chip counts changed. Mirrors {@link PlinkoOptions.onSupplyChange}. */
  'plinko-supply-change': CustomEvent<SupplySnapshot>;
  /**
   * The last chip of a kind was used up (dropped, or lost off the board). Mirrors
   * {@link PlinkoOptions.onExhausted}.
   */
  'plinko-exhausted': CustomEvent<ChipDetails<CV>>;
}

// Compile-time guard: the written-out map above must match EVENTS and the callback types exactly,
// including where the chip and slot value types go.
type DerivedEventMap<CV, SV> = {
  [K in EventCallback as (typeof EVENTS)[K]]: CustomEvent<
    Parameters<NonNullable<PlinkoOptions<CV, SV>[K]>>[0]
  >;
};
type MutuallyAssignable<A, B> = [A, B] extends [B, A] ? true : false;
const EVENT_MAP_MATCHES: MutuallyAssignable<
  PlinkoBoardEventMap<'cv', 'sv'>,
  DerivedEventMap<'cv', 'sv'>
> = true;
void EVENT_MAP_MATCHES;

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

/**
 * The `<plinko-board>` custom element. Importing `plinko-config/element` registers it.
 *
 * Set `options` as a property (they hold arrays and functions, so there are no attributes). The
 * board mounts when the element is in the document and has options, and is destroyed when the
 * element is removed. Changing `options` updates the live board, or remounts it if a mount-only
 * option changed. Every callback is also fired as a DOM event; see {@link PlinkoBoardEventMap}.
 *
 * `CV` and `SV` are the chip and slot value types, as in {@link PlinkoOptions}. Name them when you
 * look the element up, and `addEventListener` types each event's `detail` to match.
 *
 * @example
 * ```ts
 * import 'plinko-config/element';
 * import type { PlinkoBoardElement } from 'plinko-config/element';
 *
 * const el = document.querySelector<PlinkoBoardElement<boolean, string>>('plinko-board')!;
 * el.options = { slots, chips };
 * el.addEventListener('plinko-land', (event) => {
 *   const { chip, slot } = event.detail; // chip.value: boolean, slot.value: string
 * });
 * ```
 */
export class PlinkoBoardElement<CV = unknown, SV = unknown> extends BaseElement {
  private config: PlinkoOptions<CV, SV> | undefined;
  private current: PlinkoBoard<CV, SV> | undefined;
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
  get options(): PlinkoOptions<CV, SV> | undefined {
    return this.config;
  }

  /** Setting `undefined` destroys the board. */
  set options(next: PlinkoOptions<CV, SV> | undefined) {
    const previous = this.config;
    this.config = next;
    this.apply(previous);
  }

  /** The live board's handle (drop(), supply, …); undefined while not mounted. */
  get board(): PlinkoBoard<CV, SV> | undefined {
    return this.current;
  }

  /** Listens for a `plinko-*` event, typed from {@link PlinkoBoardEventMap}, or any DOM event. */
  override addEventListener<K extends keyof PlinkoBoardEventMap>(
    type: K,
    listener: (this: this, event: PlinkoBoardEventMap<CV, SV>[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  override addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: this, event: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  // biome-ignore lint/complexity/useMaxParams: the DOM's signature, which this only narrows
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, listener, options);
  }

  /** Removes a listener added with `addEventListener`. */
  override removeEventListener<K extends keyof PlinkoBoardEventMap>(
    type: K,
    listener: (this: this, event: PlinkoBoardEventMap<CV, SV>[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  override removeEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: this, event: HTMLElementEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
  // biome-ignore lint/complexity/useMaxParams: the DOM's signature, which this only narrows
  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, listener, options);
  }

  /** Called by the browser when the element is added to a document: mounts the board. */
  connectedCallback(): void {
    this.apply(undefined);
  }

  /** Called by the browser when the element is removed: destroys the board. */
  disconnectedCallback(): void {
    this.unmount();
  }

  /** Mount, remount, or update, whichever the change needs. */
  private apply(previous: PlinkoOptions<CV, SV> | undefined): void {
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
function mountOnlyChanged<CV, SV>(
  previous: PlinkoOptions<CV, SV>,
  next: PlinkoOptions<CV, SV>,
): boolean {
  return MOUNT_ONLY.some((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
}

function liveOptions<CV, SV>(options: PlinkoOptions<CV, SV>): PlinkoOptions<CV, SV> {
  const live = { ...options };
  for (const key of MOUNT_ONLY) delete live[key];
  return live;
}

/** Wraps each callback so it also fires its event. The host's own callback still runs. */
function withEvents<CV, SV>(
  element: HTMLElement,
  options: PlinkoOptions<CV, SV>,
): PlinkoOptions<CV, SV> {
  const wrapped: PlinkoOptions<CV, SV> = { ...options };
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
