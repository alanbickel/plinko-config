// Option validation helpers, shared by core and runtime.

/** Thrown for invalid options, with a message meant for the developer configuring the board. */
export class PlinkoConfigError extends Error {
  override name = 'PlinkoConfigError';
}

export function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new PlinkoConfigError(message);
}

export const isFiniteNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

export const isPositive = (n: unknown): boolean => isFiniteNumber(n) && n > 0;

/** In [0, 1]. */
export const inUnit = (n: unknown): boolean => isFiniteNumber(n) && n >= 0 && n <= 1;

/** In (0, 1]: a fraction that can't be zero. */
export const inPositiveUnit = (n: unknown): boolean => isFiniteNumber(n) && n > 0 && n <= 1;
