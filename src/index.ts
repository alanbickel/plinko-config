// Public API.

export type {
  BoardConfig,
  ChipKindConfig,
  PhysicsConfig,
  SlotConfig,
} from './core/types';
export { PlinkoConfigError } from './core/validate';
export { createPlinko } from './runtime/board';
export { DEFAULT_KEYS, type KeyBindings } from './runtime/input/keyboard';
export { DEFAULT_LABELS, type Labels } from './runtime/labels';
export { DEFAULT_THEME, type Theme } from './runtime/theme';
export type {
  DropDetails,
  DropOptions,
  FullDetails,
  FullReason,
  LandDetails,
  MissDetails,
  PegHitDetails,
  PickUpDetails,
  PlinkoBoard,
  PlinkoOptions,
  Settled,
} from './runtime/types';
