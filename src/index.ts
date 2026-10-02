/**
 * Mount a Plinko board with {@link createPlinko} and react to where chips land.
 *
 * @module plinko-config
 */

export type {
  AddChips,
  IntervalRefill,
  NeverRefill,
  OnRequestRefill,
  RefillPolicy,
  SetCount,
  SupplySnapshot,
} from './core/supply';
export type {
  BoardConfig,
  ChipKindConfig,
  PhysicsConfig,
  SlotConfig,
} from './core/types';
export { PlinkoConfigError } from './core/validate';
export { createPlinko } from './runtime/board';
export { DEFAULT_KEYS, type KeyBindings } from './runtime/input/keyboard';
export {
  type BatchLabelInput,
  type ChipLabel,
  type ChipLabelInput,
  DEFAULT_LABELS,
  type Labels,
  type LandingLabelInput,
  type StockLabelInput,
} from './runtime/labels';
export type { ChipStyle, SlotStyle, Styles, TextStyle } from './runtime/styles';
export { DEFAULT_THEME, type Theme } from './runtime/theme';
export type {
  BoardUpdate,
  ChipDetails,
  DropDetails,
  DropOptions,
  FullDetails,
  FullReason,
  LandDetails,
  MissDetails,
  MountOnlyOption,
  PegHitDetails,
  PlinkoBoard,
  PlinkoOptions,
  RequestAnswer,
  Settled,
  SupplyController,
  SupplyOptions,
  SupplyRequest,
} from './runtime/types';
