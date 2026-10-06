// E2E harness: mounts the built package (dist/) the way a consumer would, and logs what specs read.
// Served with its types stripped (scripts/serve-e2e.ts); types come from src/, code from dist/.

import type * as Plinko from '../../src/index';

type Lib = typeof Plinko;
type PlinkoBoard = Plinko.PlinkoBoard;
type PlinkoOptions = Plinko.PlinkoOptions;

/** Options a spec can send across page.evaluate: callbacks are added here, and logged. */
export type HarnessOptions = Omit<PlinkoOptions, `on${string}`>;

export interface MountSpec {
  /** Merged over the defaults: five slots, On and Off chips (5 each), refill on request, reload. */
  options?: Partial<HarnessOptions>;
  /** 'fixed': the host has its own height. 'auto' (default): it follows the board. */
  host?: 'fixed' | 'auto';
  /** How onRequest answers; 'none' (default) leaves the callback out, which grants. */
  answer?: 'none' | 'grant' | 'deny';
  /** Extra page CSS, e.g. theme variables or a tall page. */
  css?: string;
}

export interface ElementSpec {
  options: HarnessOptions;
  /** Inline style on the element. */
  style?: string;
}

export interface Harness {
  mount(spec?: MountSpec): void;
  mountElement(spec: ElementSpec): void;
  board(): PlinkoBoard | undefined;
  destroy(): void;
}

declare global {
  interface Window {
    harness: Harness;
  }
}

const lib: Lib = await import('/dist/index.js' as string);
await import('/dist/element.js' as string);

const host = document.getElementById('host') as HTMLElement;
let board: PlinkoBoard | undefined;
let liveObserver: MutationObserver | undefined;

const SLOT_NAMES = ['Email Marketing', 'Dark Mode', 'Cookies', 'Push Notifications', 'Autoplay'];

const DEFAULTS: HarnessOptions = {
  slots: SLOT_NAMES.map((label, i) => ({ id: `s${i}`, label })),
  chips: [
    { id: 'on', label: 'On', count: 5 },
    { id: 'off', label: 'Off', count: 5 },
  ],
  styles: { chips: { on: { fill: '#3ec7a8' }, off: { fill: '#e0607e' } } },
  supply: { refill: { mode: 'onRequest' } },
  physics: { seed: 1 },
  autoReload: true,
};

function append(list: string, text: string): void {
  const li = document.createElement('li');
  li.textContent = text;
  document.getElementById(list)?.append(li);
}

const log = (name: string, payload: unknown) => append('log', `${name} ${JSON.stringify(payload)}`);

const ANSWERS = {
  none: undefined,
  grant: () => 'grant' as const,
  deny: () => 'deny' as const,
};

/** Every callback, logged under its name. */
function callbacks(answer: MountSpec['answer']): Partial<PlinkoOptions> {
  const respond = ANSWERS[answer ?? 'none'];
  return {
    onRequest: respond
      ? (details) => {
          log('onRequest', details.chip.id);
          return respond();
        }
      : undefined,
    onSupplyChange: (s) => log('onSupplyChange', s.counts),
    onExhausted: ({ chip }) => log('onExhausted', chip.id),
    onPickUp: ({ chip }) => log('onPickUp', chip.id),
    onDrop: (d) => log('onDrop', { ...d, chip: d.chip.id }),
    onLand: (d) => log('onLand', { ...d, chip: d.chip.id, slot: d.slot.label }),
    onMiss: (d) => log('onMiss', { ...d, chip: d.chip.id }),
    onFull: (d) => log('onFull', d),
  };
}

function addCss(css: string | undefined): void {
  if (css)
    document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
}

/** Copies everything the live region says into the transcript. */
function watchAnnouncements(root: ParentNode): void {
  const live = root.querySelector('[aria-live]');
  liveObserver?.disconnect();
  liveObserver = new MutationObserver(() => {
    const text = live?.textContent?.replace(/​/g, '');
    if (text) append('transcript', text);
  });
  if (live) liveObserver.observe(live, { childList: true, characterData: true, subtree: true });
}

const PLINKO_EVENTS = ['plinko-pick-up', 'plinko-drop', 'plinko-land', 'plinko-miss'];
for (const type of PLINKO_EVENTS) document.addEventListener(type, () => append('events', type));

window.harness = {
  mount(spec = {}) {
    addCss(spec.css);
    host.className = spec.host ?? 'auto';
    board = lib.createPlinko(host, { ...DEFAULTS, ...spec.options, ...callbacks(spec.answer) });
    watchAnnouncements(board.element);
  },
  mountElement({ options, style }) {
    const el = document.createElement('plinko-board');
    if (style) el.setAttribute('style', style);
    el.options = options;
    host.replaceWith(el);
  },
  board: () => board,
  destroy() {
    board?.destroy();
    board = undefined;
    liveObserver?.disconnect();
  },
};
