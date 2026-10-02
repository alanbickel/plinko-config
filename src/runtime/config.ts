// Runtime options: defaults and validation (core options are resolved in core/options.ts).

import type { Layout } from '../core/layout';
import { checkCounts, type ResolvedRefill, resolveRefill } from '../core/supply';
import { check, inPositiveUnit } from '../core/validate';
import { type KeyBindings, resolveKeys } from './input/keyboard';
import { DEFAULT_LABELS, type Labels } from './labels';
import type { MotionPreference, PlinkoOptions } from './types';
import { defaultLiftSteps } from './view/geometry';

export interface RuntimeConfig {
  motion: MotionPreference;
  maxInFlight: number;
  autoReload: boolean;
  aimStep: number;
  aimStepLarge: number;
  liftStep: number;
  liftStepLarge: number;
  keys: KeyBindings;
  labels: Labels;
  attribution: boolean;
  refill: ResolvedRefill;
}

export interface RuntimeConfigInput {
  options: PlinkoOptions;
  layout: Layout;
}

/** Applies defaults and validates. Throws PlinkoConfigError with a readable message. */
export function resolveRuntimeConfig({ options, layout }: RuntimeConfigInput): RuntimeConfig {
  const config: RuntimeConfig = {
    ...behaviour(options),
    ...steps({ options, layout }),
    keys: resolveKeys(options.keys),
    labels: { ...DEFAULT_LABELS, ...options.labels },
    refill: resolveRefill(options.supply?.refill),
  };
  checkCounts(options.chips);
  check(MOTIONS.includes(config.motion), "motion must be 'auto', 'full', or 'reduced'");
  check(isMaxInFlight(config.maxInFlight), 'maxInFlight must be a positive integer or Infinity');
  for (const key of STEP_OPTIONS)
    check(inPositiveUnit(config[key]), `${key} must be a number in (0, 1]`);
  return config;
}

type Behaviour = Pick<RuntimeConfig, 'motion' | 'maxInFlight' | 'autoReload' | 'attribution'>;

function behaviour(options: PlinkoOptions): Behaviour {
  return {
    motion: options.motion ?? 'auto',
    maxInFlight: options.maxInFlight ?? Infinity,
    autoReload: options.autoReload ?? true,
    attribution: options.attribution ?? true,
  };
}

type StepSizes = Pick<RuntimeConfig, (typeof STEP_OPTIONS)[number]>;

/** Aim steps default to a quarter slot and a slot; lift steps to one peg row and four. */
function steps({ options, layout }: RuntimeConfigInput): StepSizes {
  const lift = defaultLiftSteps(layout);
  return {
    aimStep: options.aimStep ?? 1 / (4 * layout.slotCount),
    aimStepLarge: options.aimStepLarge ?? 1 / layout.slotCount,
    liftStep: options.liftStep ?? lift.liftStep,
    liftStepLarge: options.liftStepLarge ?? lift.liftStepLarge,
  };
}

const MOTIONS: readonly MotionPreference[] = ['auto', 'full', 'reduced'];

const STEP_OPTIONS = ['aimStep', 'aimStepLarge', 'liftStep', 'liftStepLarge'] as const;

const isMaxInFlight = (n: number): boolean => n === Infinity || (Number.isInteger(n) && n >= 1);
