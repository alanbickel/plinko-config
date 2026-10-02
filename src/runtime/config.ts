// Runtime options: defaults and validation (core options are resolved in core/options.ts).

import { check, inPositiveUnit } from '../core/validate';
import { type KeyBindings, resolveKeys } from './input/keyboard';
import { DEFAULT_LABELS, type Labels } from './labels';
import type { PlinkoOptions } from './types';

export interface RuntimeConfig {
  maxInFlight: number;
  autoReload: boolean;
  aimStep: number;
  aimStepLarge: number;
  keys: KeyBindings;
  labels: Labels;
  attribution: boolean;
}

export interface RuntimeConfigInput {
  options: PlinkoOptions;
  slotCount: number;
}

/** Applies defaults and validates. Throws PlinkoConfigError with a readable message. */
export function resolveRuntimeConfig({ options, slotCount }: RuntimeConfigInput): RuntimeConfig {
  const config: RuntimeConfig = {
    maxInFlight: options.maxInFlight ?? Infinity,
    autoReload: options.autoReload ?? true,
    aimStep: options.aimStep ?? 1 / (4 * slotCount),
    aimStepLarge: options.aimStepLarge ?? 1 / slotCount,
    keys: resolveKeys(options.keys),
    labels: { ...DEFAULT_LABELS, ...options.labels },
    attribution: options.attribution ?? true,
  };
  check(isMaxInFlight(config.maxInFlight), 'maxInFlight must be a positive integer or Infinity');
  check(inPositiveUnit(config.aimStep), 'aimStep must be a number in (0, 1]');
  check(inPositiveUnit(config.aimStepLarge), 'aimStepLarge must be a number in (0, 1]');
  return config;
}

const isMaxInFlight = (n: number): boolean => n === Infinity || (Number.isInteger(n) && n >= 1);
