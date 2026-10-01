// Runtime debug page: the real board through the public API only, plus a dev panel.
// Not part of the package.
import { createPlinko, type PlinkoBoard } from '../src/index';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const host = $('host');

const SLOT_NAMES = [
  'Email Marketing',
  'Dark Mode',
  'Cookies',
  'Push Notifications',
  'Autoplay',
  'Telemetry',
  'Newsletter',
  'Beta Features',
  'Location',
  'Sounds',
  'Haptics',
  'Ads',
];

let board: PlinkoBoard | undefined;
let liveObserver: MutationObserver | undefined;
let pegHits = 0;
let selectedKind = 'on';

function list(id: string, text: string, tag?: string) {
  const ol = $(id);
  const li = document.createElement('li');
  if (tag) {
    const span = Object.assign(document.createElement('span'), {
      className: 'tag',
      textContent: tag,
    });
    li.append(span, ' ');
  }
  li.append(text);
  ol.append(li);
  while (ol.children.length > 200) ol.firstElementChild?.remove();
  ol.scrollTop = ol.scrollHeight;
}
const log = (name: string, payload: unknown) => list('log', JSON.stringify(payload), name);

function mount() {
  board?.destroy();
  pegHits = 0;
  const slotCount = Math.min(12, Math.max(1, Number($<HTMLInputElement>('slots').value) || 5));
  const optionalNumber = (id: string) => {
    const raw = $<HTMLInputElement>(id).value;
    return raw ? Number(raw) : undefined;
  };
  try {
    board = createPlinko(host, {
      slots: SLOT_NAMES.slice(0, slotCount).map((label, i) => ({ id: `s${i}`, label })),
      chips: [
        { id: 'on', label: 'On', color: '#3ec7a8' },
        { id: 'off', label: 'Off', color: '#e0607e' },
      ],
      physics: { seed: Number($<HTMLInputElement>('seed').value) || 1 },
      autoReload: $<HTMLInputElement>('autoReload').checked,
      attribution: $<HTMLInputElement>('attribution').checked,
      aimStep: optionalNumber('aimStep'),
      aimStepLarge: optionalNumber('aimStepLarge'),
      onPickUp: (chip) => {
        selectedKind = chip.id;
        log('onPickUp', chip.id);
      },
      onDrop: (chip, d) => log('onDrop', { chip: chip.id, ...d }),
      onPegHit: () => {
        pegHits++;
      },
      onLand: (chip, slot, d) => log('onLand', { chip: chip.id, slot: slot.label, ...d }),
      onMiss: (chip, d) => log('onMiss', { chip: chip.id, ...d }),
      onFull: (d) => log('onFull', d),
    });
  } catch (err) {
    log('error', String(err));
    board = undefined;
    return;
  }
  const live = board.element.querySelector('[aria-live]');
  liveObserver?.disconnect();
  liveObserver = new MutationObserver(() => {
    const text = live?.textContent?.replace(/​/g, '');
    if (text) list('transcript', text);
  });
  if (live) liveObserver.observe(live, { childList: true, characterData: true, subtree: true });
}

const calls: Record<string, () => void> = {
  pickUp: () => log('pickUp()', board?.pickUp(selectedKind)),
  aim: () => board?.aim(Math.random()),
  drop: () => {
    board?.drop().then(
      (s) => log('drop() resolved', s),
      (e) => log('drop() rejected', String(e)),
    );
  },
  burst: () => {
    for (let i = 0; i < 20; i++) {
      board?.drop({ x: Math.random() }).then(
        () => {},
        (e) => log('drop() rejected', String(e)),
      );
    }
  },
  cancel: () => board?.cancel(),
  pause: () => board?.pause(),
  resume: () => board?.resume(),
  destroy: () => {
    board?.destroy();
    board = undefined;
    liveObserver?.disconnect();
    log('destroy()', { leftoverNodesInHost: host.childNodes.length });
  },
  mount,
};
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-call]')) {
  button.addEventListener('click', () => calls[button.dataset.call ?? '']?.());
}
for (const id of ['autoReload', 'attribution', 'seed', 'slots', 'aimStep', 'aimStepLarge']) {
  $(id).addEventListener('change', mount);
}
$('skip').addEventListener('click', (e) => {
  e.preventDefault();
  board?.element.querySelector('canvas')?.focus();
});

function describeFocus(el: Element | null): string {
  if (!el || el === document.body) return 'body';
  if (board?.element.contains(el)) return `board ${el.tagName.toLowerCase()}`;
  const label = el.id ? `#${el.id}` : (el.textContent ?? '').trim().slice(0, 24);
  return `${el.tagName.toLowerCase()} ${label}`;
}

function renderState() {
  const el = board?.element;
  const rows: [string, string][] = [
    ['mounted', String(Boolean(board))],
    ['state', el?.dataset.state ?? '—'],
    ['zone', el?.dataset.zone ?? '—'],
    ['focus', describeFocus(document.activeElement)],
    ['peg hits', String(pegHits)],
  ];
  $('state').replaceChildren(
    ...rows.flatMap(([k, v]) => [
      Object.assign(document.createElement('dt'), { textContent: k }),
      Object.assign(document.createElement('dd'), { textContent: v }),
    ]),
  );
  requestAnimationFrame(renderState);
}

mount();
renderState();
