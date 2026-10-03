// "Export config": the playground's current setup as code a developer can paste into their app.
// A JavaScript object literal (not JSON), with only the options that differ from the defaults.

import {
  DEFAULT_BOARD,
  DEFAULT_CONTROLS,
  DEFAULT_PHYSICS,
  DEFAULT_SLOT_LABELS,
  LIGHT_THEME,
  type PlaygroundConfig,
} from './config';

type Literal = string | number | boolean | Literal[] | LiteralObject;
interface LiteralObject {
  [key: string]: Literal;
}

/** Keys of `actual` whose values differ from `defaults`. */
function changed<T extends object>(actual: T, defaults: T): Partial<T> {
  const entries = Object.entries(actual).filter(
    ([key, value]) => value !== defaults[key as keyof T],
  );
  return Object.fromEntries(entries) as Partial<T>;
}

/** Drops keys whose value is null, undefined, or an empty object. */
function compact(object: Record<string, unknown>): LiteralObject {
  const isEmpty = (v: unknown) =>
    v === null || v === undefined || (typeof v === 'object' && Object.keys(v).length === 0);
  return Object.fromEntries(Object.entries(object).filter(([, v]) => !isEmpty(v))) as LiteralObject;
}

function styleEntries(items: readonly { id: string; fill: string }[]): LiteralObject {
  return Object.fromEntries(items.filter((i) => i.fill).map((i) => [i.id, { fill: i.fill }]));
}

function supplyLiteral(config: PlaygroundConfig): LiteralObject | undefined {
  const { refill, everyMs } = config.supply;
  const policies: Record<typeof refill, LiteralObject | undefined> = {
    never: undefined,
    onRequest: { refill: { mode: 'onRequest' } },
    interval: { refill: { mode: 'interval', everyMs } },
  };
  return policies[refill];
}

function optionsLiteral(config: PlaygroundConfig): LiteralObject {
  const physics = { ...changed(config.physics, DEFAULT_PHYSICS), seed: config.seed };
  return compact({
    slots: config.slots.map(({ id, label }) => ({ id, label })),
    chips: config.chips.map(({ id, label, count }) =>
      count === null ? { id, label } : { id, label, count },
    ),
    board: changed(config.board, DEFAULT_BOARD),
    slotLabels: changed(config.slotLabels, DEFAULT_SLOT_LABELS),
    physics: compact(physics),
    supply: supplyLiteral(config),
    ...compact(changed(config.controls, DEFAULT_CONTROLS)),
    theme: config.theme === 'light' ? { ...LIGHT_THEME } : undefined,
    styles: compact({ slots: styleEntries(config.slots), chips: styleEntries(config.chips) }),
  });
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const INDENT = '  ';

function key(name: string): string {
  return IDENTIFIER.test(name) ? name : `'${name}'`;
}

/** Short collections fit on one line; longer ones get one item per line. */
const MAX_INLINE = 80;

interface Bracketed {
  items: string[];
  open: string;
  close: string;
  depth: number;
}

function literal(value: Literal, depth: number): string {
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) {
    const items = value.map((v) => literal(v, depth + 1));
    return bracket({ items, open: '[', close: ']', depth });
  }
  const items = Object.entries(value).map(([k, v]) => `${key(k)}: ${literal(v, depth + 1)}`);
  return bracket({ items, open: '{ ', close: ' }', depth });
}

function bracket({ items, open, close, depth }: Bracketed): string {
  const flat = `${open}${items.join(', ')}${close}`;
  if (flat.length + depth * INDENT.length < MAX_INLINE && !flat.includes('\n')) return flat;
  const pad = INDENT.repeat(depth + 1);
  const lines = items.map((item) => `${pad}${item},`).join('\n');
  return `${open.trim()}\n${lines}\n${INDENT.repeat(depth)}${close.trim()}`;
}

const CALLBACKS = `  onLand: ({ chip, slot }) => {
    // A chip landed: save the preference (e.g. slot.id is now chip.label).
  },`;

const REQUEST_CALLBACK = `  onRequest: async ({ chip }) => {
    // Someone asked for more chips: answer 'grant' or 'deny'.
    return 'grant';
  },`;

/** The current setup as a createPlinko() call. */
export function exportConfig(config: PlaygroundConfig): string {
  const body = literal(optionsLiteral(config), 0).slice(0, -1).trimEnd();
  const extras = config.supply.refill === 'onRequest' ? [CALLBACKS, REQUEST_CALLBACK] : [CALLBACKS];
  return [
    "import { createPlinko } from 'plinko-config';",
    '',
    `const board = createPlinko('#board', ${body}`,
    ...extras,
    '});',
  ].join('\n');
}
