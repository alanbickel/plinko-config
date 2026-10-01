// Public API.
export { PlinkoConfigError } from './core/options';
export type {
  BoardConfig,
  ChipKindConfig,
  PhysicsConfig,
  SlotConfig,
} from './core/types';
export { createPlinko } from './runtime/board';
export { DEFAULT_KEYS, type KeyBindings } from './runtime/input/keyboard';
export { DEFAULT_LABELS, type Labels } from './runtime/labels';
export { DEFAULT_THEME, type Theme } from './runtime/theme';
export type {
  DropDetails,
  DropOptions,
  FullReason,
  PegHitDetails,
  PlinkoBoard,
  PlinkoOptions,
  SettleDetails,
  Settled,
} from './runtime/types';
