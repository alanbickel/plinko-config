import { randomSeed } from './rng';
import type {
  BoardConfig,
  CoreOptions,
  PhysicsConfig,
  ResolvedBoard,
  ResolvedCoreOptions,
  ResolvedPhysics,
  SlotConfig,
} from './types';
import { check, inUnit, isFiniteNumber, isPositive } from './validate';

/** The board shape used for every field you leave out of `board`. */
export const DEFAULT_BOARD: Required<BoardConfig> = {
  rows: 8,
  pegRadius: 0.08,
  chipRadius: 0.3,
  slotHeight: 2.5,
  railWidth: 0.08,
};

/**
 * The physics used for every field you leave out of `physics`. `seed` and `bias` aren't listed:
 * without them, the seed is random and no slot is favored.
 */
export const DEFAULT_PHYSICS: Required<Omit<PhysicsConfig, 'seed' | 'bias'>> = {
  gravity: 45,
  restitution: 0.3,
  friction: 0.1,
  jitter: 0.5,
  maxSpeed: 14,
  chipCollisions: true,
};

/** Anything listed in options by id and label: slots and chip kinds. */
interface Listed {
  id: string;
  label: string;
}

interface ListSpec {
  name: string;
  list: readonly Listed[];
  max: number;
}

interface PhysicsSpec {
  physics: PhysicsConfig | undefined;
  slots: readonly SlotConfig<unknown>[];
}

interface BiasSpec {
  bias: PhysicsConfig['bias'];
  slots: readonly SlotConfig<unknown>[];
}

/** Applies defaults and validates. Throws PlinkoConfigError with a readable message. */
export function resolveCoreOptions<CV, SV>(
  options: CoreOptions<CV, SV>,
): ResolvedCoreOptions<CV, SV> {
  const { slots, chips } = options;
  checkList({ name: 'slots', list: slots, max: 50 });
  checkList({ name: 'chips', list: chips, max: 20 });
  const board = resolveBoard(options.board);
  const physics = resolvePhysics({ physics: options.physics, slots });
  return { slots, chips, board, physics };
}

function resolveBoard(partial: BoardConfig | undefined): ResolvedBoard {
  const board: ResolvedBoard = { ...DEFAULT_BOARD, ...defined(partial) };
  check(
    Number.isInteger(board.rows) && board.rows >= 1 && board.rows <= 40,
    'board.rows must be an integer from 1 to 40',
  );
  for (const key of ['pegRadius', 'chipRadius', 'slotHeight', 'railWidth'] as const) {
    check(isPositive(board[key]), `board.${key} must be a positive number`);
  }
  check(
    board.chipRadius <= 0.45,
    'board.chipRadius must be at most 0.45 (one slot is 1 unit wide)',
  );
  check(
    2 * board.chipRadius < 1 - 2 * board.pegRadius,
    'chips must fit between pegs: 2 × chipRadius must be less than 1 − 2 × pegRadius',
  );
  check(board.railWidth < 0.5, 'board.railWidth must be less than 0.5');
  return board;
}

function resolvePhysics({ physics: p = {}, slots }: PhysicsSpec): ResolvedPhysics {
  const physics: ResolvedPhysics = {
    ...DEFAULT_PHYSICS,
    ...defined({ ...p, bias: undefined, seed: undefined }),
    seed: p.seed ?? randomSeed(),
    bias: slots.map((slot) => p.bias?.[slot.id] ?? 1),
  };
  check(isPositive(physics.gravity), 'physics.gravity must be a positive number');
  check(isPositive(physics.maxSpeed), 'physics.maxSpeed must be a positive number');
  check(inUnit(physics.restitution), 'physics.restitution must be between 0 and 1');
  check(inUnit(physics.friction), 'physics.friction must be between 0 and 1');
  check(isFiniteNumber(physics.jitter) && physics.jitter >= 0, 'physics.jitter must be ≥ 0');
  check(Number.isInteger(physics.seed), 'physics.seed must be an integer');
  checkBias({ bias: p.bias, slots });
  return physics;
}

function checkBias({ bias, slots }: BiasSpec): void {
  for (const [id, weight] of Object.entries(bias ?? {})) {
    check(
      slots.some((slot) => slot.id === id),
      `physics.bias refers to unknown slot "${id}"`,
    );
    check(isFiniteNumber(weight) && weight >= 0, `physics.bias["${id}"] must be a number ≥ 0`);
  }
}

function checkList({ name, list, max }: ListSpec): void {
  check(Array.isArray(list) && list.length >= 1, `${name} must be a non-empty array`);
  check(list.length <= max, `${name} can have at most ${max} entries`);
  const seen = new Set<string>();
  list.forEach((item, i) => {
    check(
      typeof item?.id === 'string' && item.id !== '',
      `${name}[${i}].id must be a non-empty string`,
    );
    check(typeof item.label === 'string', `${name}[${i}].label must be a string`);
    check(!seen.has(item.id), `${name} has a duplicate id "${item.id}"`);
    seen.add(item.id);
  });
}

/** Drops keys whose value is undefined, so they don't overwrite defaults. */
function defined<T extends object>(obj: T | undefined): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj ?? {}).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
