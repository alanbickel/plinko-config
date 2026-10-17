import type { SupplySnapshot } from 'plinko-config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlaygroundBoard, type PlaygroundBoard } from './board';
import { initialConfig, type PlaygroundConfig } from './config';

/** What the controller reported, in order: the callback's name and what it passed. */
let events: [string, unknown][];
let host: HTMLElement;
let controller: PlaygroundBoard;

const named = (name: string) => events.filter(([n]) => n === name).map(([, value]) => value);
const record = (name: string) => (value?: unknown) => events.push([name, value]);
/** Runs timers and the frame loop for this much simulated time. */
const run = (ms: number) => vi.advanceTimersByTime(ms);

const config = (change: (c: PlaygroundConfig) => void = () => {}): PlaygroundConfig => {
  const c = initialConfig('dark');
  c.seed = 1;
  change(c);
  return c;
};
/** A board option that only takes effect on a fresh board, so changing it rebuilds. */
const rebuilt = (rows: number) => config((c) => (c.board.rows = rows));
/** One auto-drop, then auto-drop off again. */
const dropOne = () => {
  controller.setAutoDrop(true);
  run(600);
  controller.setAutoDrop(false);
};

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
  events = [];
  host = document.createElement('div');
  document.body.append(host);
  controller = createPlaygroundBoard({
    host,
    onLog: () => {},
    onAnnounce: () => {},
    onFalling: record('falling'),
    onResult: record('result'),
    onSupply: record('supply'),
    onFull: record('full'),
    onReset: record('reset'),
    onError: () => {},
  });
});

afterEach(() => {
  controller.destroy();
  host.remove();
  vi.useRealTimers();
});

describe('a board that locks while it is built', () => {
  const empty = () =>
    config((c) => {
      c.chips = c.chips.map((chip) => ({ ...chip, count: 0 }));
      c.supply.refill = 'never';
    });

  // Regression (#2 review): the lock fired inside createPlinko, before onReset cleared the last
  // board's state, so the State pane showed the new board as open.
  it('reports the lock after the reset, so the reset does not clear it', () => {
    controller.apply(empty());
    run(0);
    const order = events.map(([name]) => name).filter((n) => n === 'reset' || n === 'full');
    expect(order).toEqual(['reset', 'full']);
    expect(named('full')).toEqual(['exhausted']);
  });

  it('reports it again for each rebuild', () => {
    controller.apply(empty());
    run(0);
    controller.reset();
    expect(named('full')).toEqual(['exhausted', 'exhausted']);
    expect(events.at(-1)).toEqual(['full', 'exhausted']);
  });
});

describe('pause', () => {
  // Regression (#2 review): every new board starts running, so a rebuild dropped the pause.
  it('holds across a rebuild', () => {
    controller.apply(rebuilt(6));
    run(0);
    controller.setPaused(true);
    controller.apply(rebuilt(7));
    run(250);
    expect(named('reset')).toHaveLength(2);
    dropOne();
    run(10_000);
    expect(named('falling')).toEqual([1]);
    expect(named('result')).toEqual([]);
  });

  it('lets the chip land once resumed', () => {
    controller.apply(rebuilt(6));
    run(0);
    controller.setPaused(true);
    dropOne();
    run(10_000);
    expect(named('result')).toEqual([]);
    controller.setPaused(false);
    run(10_000);
    expect(named('result')).toHaveLength(1);
    expect(named('falling')).toEqual([1, 0]);
  });
});

describe('falling count', () => {
  it('counts up on each drop and down on each result', () => {
    controller.apply(config());
    run(0);
    controller.setAutoDrop(true);
    run(1200);
    controller.setAutoDrop(false);
    run(10_000);
    expect(named('falling')).toEqual([1, 2, 1, 0]);
    expect(named('result')).toHaveLength(2);
  });

  // A rebuild throws away the chips in flight; they never land, so the count must start over.
  it('starts again from zero on a fresh board', () => {
    controller.apply(rebuilt(6));
    run(0);
    controller.setPaused(true);
    dropOne();
    controller.apply(rebuilt(7));
    run(250);
    controller.setPaused(false);
    dropOne();
    expect(named('falling')).toEqual([1, 1]);
  });
});

describe('supply', () => {
  const counts = () => named('supply').map((s) => (s as SupplySnapshot).counts);
  const total = (c: Record<string, number> | undefined) =>
    Object.values(c ?? {}).reduce((a, b) => a + b, 0);

  it('reports the full supply for each fresh board, and each change', () => {
    controller.apply(rebuilt(6));
    run(0);
    expect(counts()).toEqual([{ on: 5, off: 5 }]);
    dropOne();
    expect(counts()).toHaveLength(2);
    expect(total(counts()[1])).toBe(9);
    controller.apply(rebuilt(7));
    run(250);
    expect(counts()).toHaveLength(3);
    expect(counts()[2]).toEqual({ on: 5, off: 5 });
  });
});
