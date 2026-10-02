// The playground's editable configuration, and how it becomes createPlinko() options.
// Public API only: everything here is something a developer could write themselves.

import {
  type BoardConfig,
  type BoardUpdate,
  DEFAULT_BOARD,
  DEFAULT_PHYSICS,
  DEFAULT_SLOT_LABELS,
  type MotionPreference,
  type PhysicsConfig,
  type PlinkoOptions,
  type RefillPolicy,
  type RequestAnswer,
  type SlotLabelOptions,
  type Styles,
} from '../../../../src/index';

export { DEFAULT_BOARD, DEFAULT_PHYSICS, DEFAULT_SLOT_LABELS };

export interface SlotDraft {
  id: string;
  label: string;
  /** Tint for the slot's column; empty for none. */
  fill: string;
}

export interface ChipDraft {
  id: string;
  label: string;
  /** Starting count; null for unlimited. */
  count: number | null;
  fill: string;
}

export type RefillMode = RefillPolicy['mode'];

/** How the playground answers requests for more chips. */
export type RequestBehaviour = 'grant' | 'deny' | 'slow';

export interface SupplyDraft {
  refill: RefillMode;
  everyMs: number;
  answer: RequestBehaviour;
}

export interface ControlsDraft {
  autoReload: boolean;
  /** Null for unlimited. */
  maxInFlight: number | null;
  motion: MotionPreference;
  attribution: boolean;
  /** Null for the library's default. */
  aimStep: number | null;
  aimStepLarge: number | null;
  liftStep: number | null;
  liftStepLarge: number | null;
}

export interface PlaygroundConfig {
  slots: SlotDraft[];
  chips: ChipDraft[];
  physics: Required<Omit<PhysicsConfig, 'seed' | 'bias'>>;
  /** Null for a random seed on each mount. */
  seed: number | null;
  board: Required<BoardConfig>;
  slotLabels: Required<SlotLabelOptions>;
  controls: ControlsDraft;
  supply: SupplyDraft;
}

export const DEFAULT_CONTROLS: ControlsDraft = {
  autoReload: true,
  maxInFlight: null,
  motion: 'auto',
  attribution: true,
  aimStep: null,
  aimStepLarge: null,
  liftStep: null,
  liftStepLarge: null,
};

export function initialConfig(): PlaygroundConfig {
  return {
    slots: [
      { id: 'email', label: 'Email', fill: '' },
      { id: 'push', label: 'Push', fill: '' },
      { id: 'sms', label: 'SMS', fill: '' },
      { id: 'dark-mode', label: 'Dark mode', fill: '' },
      { id: 'autoplay', label: 'Autoplay', fill: '' },
    ],
    chips: [
      { id: 'on', label: 'On', count: 5, fill: '#3ec7a8' },
      { id: 'off', label: 'Off', count: 5, fill: '#e0607e' },
    ],
    physics: { ...DEFAULT_PHYSICS },
    seed: null,
    board: { ...DEFAULT_BOARD },
    slotLabels: { ...DEFAULT_SLOT_LABELS },
    controls: { ...DEFAULT_CONTROLS },
    supply: { refill: 'onRequest', everyMs: 3000, answer: 'grant' },
  };
}

/** The options that need a fresh board when they change (see MountOnlyOption). */
export function mountOptions(config: PlaygroundConfig): Partial<PlinkoOptions> {
  return {
    slots: config.slots.map(({ id, label }) => ({ id, label })),
    chips: config.chips.map(({ id, label, count }) => ({ id, label, count: count ?? Infinity })),
    board: { ...config.board },
    physics:
      config.seed === null ? { ...config.physics } : { ...config.physics, seed: config.seed },
    supply: { refill: refillPolicy(config.supply) },
    attribution: config.controls.attribution,
  };
}

/** The options the live board can take through update(). Unset steps go back to their defaults. */
export function liveOptions(config: PlaygroundConfig): BoardUpdate {
  const { autoReload, maxInFlight, motion, aimStep, aimStepLarge, liftStep, liftStepLarge } =
    config.controls;
  return {
    autoReload,
    maxInFlight: maxInFlight ?? Infinity,
    motion,
    aimStep: aimStep ?? undefined,
    aimStepLarge: aimStepLarge ?? undefined,
    liftStep: liftStep ?? undefined,
    liftStepLarge: liftStepLarge ?? undefined,
    styles: styles(config),
    slotLabels: { ...config.slotLabels },
  };
}

function refillPolicy(supply: SupplyDraft): RefillPolicy {
  const policies: Record<RefillMode, RefillPolicy> = {
    never: { mode: 'never' },
    onRequest: { mode: 'onRequest' },
    interval: { mode: 'interval', everyMs: supply.everyMs },
  };
  return policies[supply.refill];
}

function styles(config: PlaygroundConfig): Styles {
  const slots = config.slots.filter((s) => s.fill).map((s) => [s.id, { fill: s.fill }]);
  const chips = config.chips.filter((c) => c.fill).map((c) => [c.id, { fill: c.fill }]);
  return { slots: Object.fromEntries(slots), chips: Object.fromEntries(chips) };
}

const SLOW_MS = 2000;

/** The playground's onRequest, per the chosen behaviour. */
export function answerRequest(behaviour: RequestBehaviour): Promise<RequestAnswer> {
  const answers: Record<RequestBehaviour, () => Promise<RequestAnswer>> = {
    grant: async () => 'grant',
    deny: async () => 'deny',
    slow: () => new Promise((resolve) => setTimeout(() => resolve('grant'), SLOW_MS)),
  };
  return answers[behaviour]();
}

/** A stable, unique id for a new slot or chip kind, from its label. */
export function newId(label: string, taken: readonly string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}
