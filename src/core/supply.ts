// Chip supply: counts, reservations, refill caps. Pure: no timers or storage. The runtime drives
// interval refills and request flows; the host owns persistence (via snapshots and `count`).
// Unlimited is `Infinity`, so the arithmetic below needs no special cases.

import type { ChipKindConfig } from './types';
import { check, isPositive } from './validate';

/** Spent chips never come back. This is the default. */
export interface NeverRefill {
  /** Selects this policy. */
  mode: 'never';
}

/**
 * Players can ask for more chips of a kind once it runs out. Your `onRequest` callback grants or
 * denies each request; without one, every request is granted.
 */
export interface OnRequestRefill {
  /** Selects this policy. */
  mode: 'onRequest';
}

/** Chips come back on a timer, a few at a time, up to a limit. */
export interface IntervalRefill {
  /** Selects this policy. */
  mode: 'interval';
  /** Time between refills, in milliseconds. */
  everyMs: number;
  /**
   * Chips added to each kind per interval.
   *
   * @defaultValue `1`
   */
  amount?: number;
  /**
   * Refills stop once a kind has this many chips.
   *
   * @defaultValue each kind's starting `count`
   */
  max?: number;
}

/** How spent chips come back. Set it with `supply.refill`. */
export type RefillPolicy = NeverRefill | OnRequestRefill | IntervalRefill;

export interface ResolvedIntervalRefill extends IntervalRefill {
  amount: number;
}

export type ResolvedRefill = NeverRefill | OnRequestRefill | ResolvedIntervalRefill;

export interface SupplyInput {
  kinds: readonly ChipKindConfig<unknown>[];
  refill: ResolvedRefill;
}

/**
 * Chips left per kind, as `onSupplyChange` and `board.supply.get()` report them. A chip the
 * player is holding counts as used. Unlimited kinds report `Infinity`.
 */
export interface SupplySnapshot {
  /** Chip kind id → chips left. */
  counts: Record<string, number>;
}

/** Input to `board.supply.set()`. */
export interface SetCount {
  /** The chip kind's id. */
  chip: string;
  /** The new count: a whole number ≥ 0, or `Infinity` for unlimited. */
  count: number;
}

/** Input to `board.supply.add()`. */
export interface AddChips {
  /** The chip kind's id. */
  chip: string;
  /** How many chips to add. A negative amount removes chips, stopping at 0. */
  amount: number;
}

interface Stock {
  /** Chips left, not counting one in hand. */
  count: number;
  /** Chips picked up but not yet dropped or put back. */
  inHand: number;
  /** Refills (interval or granted requests) stop here. */
  cap: number;
}

export class Supply {
  private readonly stock = new Map<string, Stock>();
  private readonly refill: ResolvedRefill;

  constructor({ kinds, refill }: SupplyInput) {
    this.refill = refill;
    for (const kind of kinds) {
      const count = kind.count ?? Infinity;
      this.stock.set(kind.id, { count, inHand: 0, cap: refillCap(refill, count) });
    }
  }

  snapshot(): SupplySnapshot {
    const counts: Record<string, number> = {};
    for (const [id, s] of this.stock) counts[id] = s.count;
    return { counts };
  }

  count(chip: string): number {
    return this.stock.get(chip)?.count ?? 0;
  }

  /** Takes one chip into the hand. False if none are left. */
  reserve(chip: string): boolean {
    const s = this.stock.get(chip);
    if (!s || s.count <= 0) return false;
    s.count -= 1;
    s.inHand += 1;
    return true;
  }

  /** The chip in hand was dropped: it's spent. */
  commit(chip: string): void {
    const s = this.stock.get(chip);
    if (s && s.inHand > 0) s.inHand -= 1;
  }

  /** The chip in hand was put back. */
  release(chip: string): void {
    const s = this.stock.get(chip);
    if (!s || s.inHand <= 0) return;
    s.inHand -= 1;
    s.count += 1;
  }

  /** Host override: sets a count outright (no cap). */
  set({ chip, count }: SetCount): void {
    const s = this.requireStock(chip);
    check(isCount(count), `supply.set: count must be a whole number ≥ 0 or Infinity`);
    s.count = count;
  }

  /** Host override: adds chips (no cap). Negative amounts take chips away, down to 0. */
  add({ chip, amount }: AddChips): void {
    const s = this.requireStock(chip);
    check(Number.isInteger(amount), 'supply.add: amount must be a whole number');
    s.count = Math.max(0, s.count + amount);
  }

  /** A granted request: refills an empty kind up to its cap. */
  grant(chip: string): void {
    const s = this.stock.get(chip);
    if (s) s.count = Math.max(s.count, s.cap);
  }

  /** One interval tick: adds `amount` to every kind below its cap. Returns whether anything changed. */
  refillOnce(): boolean {
    if (this.refill.mode !== 'interval') return false;
    let changed = false;
    for (const s of this.stock.values()) {
      const next = Math.min(s.count + this.refill.amount, s.cap);
      changed ||= next > s.count;
      s.count = Math.max(s.count, next);
    }
    return changed;
  }

  /** Empty and requestable: the tray offers "request more". */
  canRequest(chip: string): boolean {
    return this.refill.mode === 'onRequest' && this.count(chip) === 0;
  }

  /** No chips anywhere, none in hand, and no way to get more: the board can never change again. */
  isExhausted(): boolean {
    if (this.refill.mode !== 'never') return false;
    return [...this.stock.values()].every((s) => s.count === 0 && s.inHand === 0);
  }

  private requireStock(chip: string): Stock {
    const s = this.stock.get(chip);
    check(s !== undefined, `supply: unknown chip "${chip}"`);
    return s;
  }
}

/** Validates and fills in defaults. Throws PlinkoConfigError with a readable message. */
export function resolveRefill(refill: RefillPolicy | undefined): ResolvedRefill {
  if (!refill) return { mode: 'never' };
  if (refill.mode !== 'interval') return refill;
  check(isPositive(refill.everyMs), 'supply.refill.everyMs must be a positive number');
  const amount = refill.amount ?? 1;
  check(Number.isInteger(amount) && amount >= 1, 'supply.refill.amount must be a whole number ≥ 1');
  check(
    refill.max === undefined || isCount(refill.max),
    'supply.refill.max must be a whole number ≥ 0',
  );
  return { ...refill, amount };
}

/** Validates each kind's starting count. */
export function checkCounts(kinds: readonly ChipKindConfig<unknown>[]): void {
  for (const kind of kinds) {
    const ok = kind.count === undefined || isCount(kind.count);
    check(ok, `chips "${kind.id}".count must be a whole number ≥ 0 or Infinity`);
  }
}

/** Where refills stop for a kind: the policy's max, else the starting count. */
function refillCap(refill: ResolvedRefill, start: number): number {
  return refill.mode === 'interval' && refill.max !== undefined ? refill.max : start;
}

const isCount = (n: number): boolean => n === Infinity || (Number.isInteger(n) && n >= 0);
