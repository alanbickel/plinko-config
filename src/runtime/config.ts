// Runtime options: defaults and validation (core options are resolved in core/options.ts).

import type { Layout } from '../core/layout';
import { checkCounts, type ResolvedRefill, resolveRefill } from '../core/supply';
import { check, inPositiveUnit } from '../core/validate';
import { type KeyBindings, resolveKeys } from './input/keyboard';
import { DEFAULT_LABELS, type Labels } from './labels';
import type { PlinkoOptions } from './types';
import { defaultLiftSteps } from './view/geometry';

export interface RuntimeConfig {
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
  const { slotCount } = layout;
  const lift = defaultLiftSteps(layout);
  const config: RuntimeConfig = {
    maxInFlight: options.maxInFlight ?? Infinity,
    autoReload: options.autoReload ?? true,
    aimStep: options.aimStep ?? 1 / (4 * slotCount),
    aimStepLarge: options.aimStepLarge ?? 1 / slotCount,
    liftStep: options.liftStep ?? lift.liftStep,
    liftStepLarge: options.liftStepLarge ?? lift.liftStepLarge,
    keys: resolveKeys(options.keys),
    labels: { ...DEFAULT_LABELS, ...options.labels },
    attribution: options.attribution ?? true,
    refill: resolveRefill(options.supply?.refill),
  };
  checkCounts(options.chips);
  check(isMaxInFlight(config.maxInFlight), 'maxInFlight must be a positive integer or Infinity');
  for (const key of STEP_OPTIONS)
    check(inPositiveUnit(config[key]), `${key} must be a number in (0, 1]`);
  return config;
}

const STEP_OPTIONS = ['aimStep', 'aimStepLarge', 'liftStep', 'liftStepLarge'] as const;

const isMaxInFlight = (n: number): boolean => n === Infinity || (Number.isInteger(n) && n >= 1);
