// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlinkoConfigError } from '../core/validate';
import { createPlinko } from './board';
import type { PlinkoBoard, PlinkoOptions } from './types';
import { BATCH_MS } from './view/a11y';

const base = (extra: Partial<PlinkoOptions> = {}): PlinkoOptions => ({
  slots: [
    { id: 'email', label: 'Email Marketing' },
    { id: 'dark', label: 'Dark Mode' },
    { id: 'cookies', label: 'Cookies' },
  ],
  chips: [
    { id: 'on', label: 'On' },
    { id: 'off', label: 'Off' },
  ],
  physics: { seed: 1 },
  ...extra,
});

let host: HTMLElement;
let boards: PlinkoBoard[] = [];
const mount = (extra: Partial<PlinkoOptions> = {}, target: HTMLElement | string = host) => {
  const board = createPlinko(target, base(extra));
  boards.push(board);
  return board;
};
const canvasOf = (b: PlinkoBoard) => b.element.querySelector('canvas') as HTMLCanvasElement;
const liveText = (b: PlinkoBoard) =>
  (b.element.querySelector('[aria-live]')?.textContent ?? '').replace(/​/g, '');
/** Presses a key on the canvas: a key name, or a full init for modifiers. */
const press = (b: PlinkoBoard, key: string | KeyboardEventInit): KeyboardEvent => {
  const init = typeof key === 'string' ? { key } : key;
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  canvasOf(b).dispatchEvent(event);
  return event;
};
/** Carries the held chip all the way up into the drop zone, by keyboard. */
const carryUp = (b: PlinkoBoard) => {
  for (let i = 0; i < 6; i++) press(b, { key: 'ArrowUp', shiftKey: true });
};
/** Runs the frame loop for this much simulated time. */
const run = (ms: number) => vi.advanceTimersByTime(ms);

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
  host = document.createElement('div');
  host.id = 'host';
  host.setAttribute('style', 'color: red');
  document.body.append(host);
});

afterEach(() => {
  for (const b of boards) b.destroy();
  boards = [];
  host.remove();
  vi.useRealTimers();
});

describe('mounting', () => {
  it('appends one wrapper and never touches the host itself', () => {
    const b = mount();
    expect(host.children).toHaveLength(1);
    expect(host.firstElementChild).toBe(b.element);
    expect(host.getAttribute('style')).toBe('color: red');
    expect(b.element.dataset).toMatchObject({ state: 'idle', zone: 'tray' });
  });

  it('accepts a selector', () => {
    const b = mount({}, '#host');
    expect(host.contains(b.element)).toBe(true);
  });

  it('throws a readable error for a bad target or options', () => {
    expect(() => createPlinko('#nope', base())).toThrow(PlinkoConfigError);
    expect(() => createPlinko(host, base({ aimStep: 0 }))).toThrow(/aimStep/);
    expect(() => createPlinko(host, base({ aimStepLarge: 2 }))).toThrow(/aimStepLarge/);
    expect(() => createPlinko(host, base({ maxInFlight: 0 }))).toThrow(/maxInFlight/);
    expect(() => createPlinko(host, base({ slots: [] }))).toThrow(PlinkoConfigError);
    expect(host.children).toHaveLength(0);
  });

  it('makes the canvas a labelled, described, focusable application', () => {
    const b = mount();
    const canvas = canvasOf(b);
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.getAttribute('role')).toBe('application');
    expect(canvas.getAttribute('aria-label')).toBe('Plinko preferences board');
    const describedBy = canvas.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toMatch(/arrows/i);
    expect(b.element.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('shows the attribution link unless turned off', () => {
    const link = mount().element.querySelector('a');
    expect(link?.href).toBe('https://github.com/KilledByAPixel/LittleJS');
    expect(link?.rel).toBe('noopener');
    expect(mount({ attribution: false }).element.querySelector('a')).toBeNull();
  });

  it('sizes the attribution link to the canvas, so it sits under the board, not the host', () => {
    const b = mount();
    const link = b.element.querySelector('a');
    expect(link?.style.width).toBe(canvasOf(b).style.width);
    expect(link?.style.margin).toContain('auto');
  });

  it('keeps instances independent', () => {
    const a = mount();
    const b = mount();
    const idA = canvasOf(a).getAttribute('aria-describedby');
    const idB = canvasOf(b).getAttribute('aria-describedby');
    expect(idA).not.toBe(idB);
    press(a, 'Enter');
    expect(a.element.dataset.state).toBe('holding');
    expect(b.element.dataset.state).toBe('idle');
  });

  it('uses custom labels', () => {
    const b = mount({
      labels: { board: 'Preferences', pickedUp: ({ chip }) => `Got ${chip.label}` },
    });
    expect(canvasOf(b).getAttribute('aria-label')).toBe('Preferences');
    press(b, 'Enter');
    expect(liveText(b)).toBe('Got On');
  });
});

describe('keyboard', () => {
  it('selects in the tray, picks up, aims, and drops', () => {
    const onPickUp = vi.fn();
    const onDrop = vi.fn();
    const b = mount({ onPickUp, onDrop, autoReload: false });

    press(b, 'ArrowRight');
    expect(liveText(b)).toBe('Off chip.');

    expect(press(b, 'Enter').defaultPrevented).toBe(true);
    expect(onPickUp).toHaveBeenCalledWith({ chip: expect.objectContaining({ id: 'off' }) });
    expect(b.element.dataset).toMatchObject({ state: 'holding', zone: 'board' });
    expect(liveText(b)).toMatch(/Picked up an Off chip/);

    carryUp(b);
    press(b, 'End');
    press(b, { key: 'ArrowLeft', shiftKey: true });
    press(b, 'Enter');
    expect(onDrop).toHaveBeenCalledWith({
      chip: expect.objectContaining({ id: 'off' }),
      dropId: 0,
      dropX: 0.666667, // one slot (of three) left of the right edge, rounded
    });
    expect(b.element.dataset.state).toBe('idle');
  });

  it('Escape puts the chip back and returns to the tray', () => {
    const b = mount();
    press(b, 'Enter');
    press(b, 'Escape');
    expect(b.element.dataset).toMatchObject({ state: 'idle', zone: 'tray' });
    expect(liveText(b)).toBe('Put the On chip back.');
  });

  it('never handles Tab or modified keys, so focus can always leave', () => {
    const b = mount();
    expect(press(b, 'Tab').defaultPrevented).toBe(false);
    press(b, 'Enter');
    expect(press(b, 'Tab').defaultPrevented).toBe(false);
    expect(press(b, { key: 'Enter', ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('honours custom bindings and step sizes', () => {
    const onDrop = vi.fn();
    const b = mount({ keys: { drop: ['d'] }, aimStep: 0.01, liftStep: 1, onDrop });
    press(b, 'Enter');
    press(b, 'ArrowUp'); // one step of the whole carry: straight into the drop zone
    press(b, 'ArrowRight');
    press(b, 'Enter'); // not a drop key any more
    expect(onDrop).not.toHaveBeenCalled();
    press(b, 'd');
    expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ dropId: 0, dropX: 0.51 }));
  });
});

describe('keyboard carrying', () => {
  it('announces the drop zone on the way up and the way down', () => {
    const b = mount();
    press(b, 'Enter');
    carryUp(b);
    expect(liveText(b)).toContain('Over the drop zone');
    press(b, { key: 'ArrowDown', shiftKey: true });
    expect(liveText(b)).toContain('Left the drop zone');
  });

  it('Enter below the drop zone loses the chip, with no callbacks and no warning', () => {
    const onDrop = vi.fn();
    const onSupplyChange = vi.fn();
    const b = mount({ chips: [{ id: 'on', label: 'On', count: 3 }], onDrop, onSupplyChange });
    press(b, 'Enter');
    press(b, 'ArrowUp');
    press(b, 'Enter');
    expect(onDrop).not.toHaveBeenCalled();
    expect(onSupplyChange).toHaveBeenLastCalledWith({ counts: { on: 2 } });
    expect(b.element.dataset).toMatchObject({ state: 'idle', zone: 'tray' });
    expect(liveText(b)).toBe('The On chip fell off the board.');
    run(1000); // the falling chip finishes and the loop sleeps
  });

  it('auto-reload keeps the next chip in the drop zone, so Enter fires again', () => {
    const onDrop = vi.fn();
    const b = mount({ onDrop });
    press(b, 'Enter');
    carryUp(b);
    press(b, 'Enter');
    press(b, 'Enter');
    expect(onDrop).toHaveBeenCalledTimes(2);
  });

  it('drop() from the handle carries the chip up itself, quietly', async () => {
    const onDrop = vi.fn();
    const b = mount({ onDrop, autoReload: false });
    b.pickUp('on');
    void b.drop();
    expect(onDrop).toHaveBeenCalledOnce();
    expect(liveText(b)).not.toContain('drop zone');
  });
});

describe('dropping and settling', () => {
  it('resolves drop() with only the drop id, and reports the outcome via callbacks', async () => {
    const onLand = vi.fn();
    const onMiss = vi.fn();
    const b = mount({ onLand, onMiss });
    const settled = b.drop({ chip: 'on', x: 0.5 });
    run(6000);
    await expect(settled).resolves.toEqual({ dropId: 0 });
    expect(onLand).toHaveBeenCalledTimes(1);
    expect(onMiss).not.toHaveBeenCalled();
    const [details] = onLand.mock.calls[0] ?? [];
    expect(details.chip.id).toBe('on');
    expect(['email', 'dark', 'cookies']).toContain(details.slot.id);
    expect(details).toMatchObject({ dropId: 0, dropX: 0.5 });
    expect(details.durationMs).toBeGreaterThan(0);
  });

  it('announces a single landing, and batches rapid fire', async () => {
    const b = mount();
    b.drop({ chip: 'on', x: 0.5 });
    run(6000);
    expect(liveText(b)).toMatch(/^On chip landed in /);

    // Settlements less than BATCH_MS apart are announced together.
    const live = b.element.querySelector('[aria-live]') as HTMLElement;
    const heard: string[] = [];
    new MutationObserver(() => heard.push(liveText(b))).observe(live, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    for (let i = 0; i < 6; i++) b.drop({ chip: 'off', x: i / 5 });
    for (let t = 0; t < 6000 + BATCH_MS; t += 50) {
      run(50);
      await Promise.resolve(); // let the observer record each announcement
    }
    const batches = heard.filter((h) => /^\d+ chips settled: /.test(h));
    expect(batches.length).toBeGreaterThan(0);
    const total = heard
      .filter((h) => /landed in|didn't make it|chips settled/.test(h))
      .reduce((n, h) => n + (Number(h.match(/^(\d+) chips settled/)?.[1]) || 1), 0);
    expect(total).toBe(6);
  });

  it('rejects drop() for an unknown kind', async () => {
    const b = mount();
    await expect(b.drop({ chip: 'nope' })).rejects.toThrow(/can't pick up "nope"/);
  });

  it('respects maxInFlight', async () => {
    const b = mount({ maxInFlight: 1 });
    b.drop({ chip: 'on' });
    await expect(b.drop({ chip: 'on' })).rejects.toThrow(/can't drop/);
    expect(liveText(b)).toMatch(/Too many chips/);
  });

  it('keeps working when a callback throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const b = mount({
      onPickUp: () => {
        throw new Error('host bug');
      },
    });
    press(b, 'Enter');
    expect(b.element.dataset.state).toBe('holding');
    expect(error).toHaveBeenCalledWith('plinko-config: a callback threw', expect.any(Error));
    error.mockRestore();
  });
});

describe('full board', () => {
  // A tiny board fills fast: one row of pegs, short slots.
  const tiny = (extra: Partial<PlinkoOptions> = {}) =>
    mount({
      slots: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      board: { rows: 1, slotHeight: 0.8 },
      ...extra,
    });

  it('locks, puts the held chip back, announces, and refuses everything', async () => {
    const onFull = vi.fn();
    const b = tiny({ onFull });
    for (let i = 0; i < 40 && onFull.mock.calls.length === 0; i++) {
      b.drop({ chip: 'on', x: (i % 5) / 4 }).catch(() => {});
      run(4000);
    }
    expect(onFull).toHaveBeenCalledTimes(1);
    expect(onFull).toHaveBeenCalledWith({ reason: expect.stringMatching(/slots|overflow/) });
    expect(b.element.dataset.state).toBe('locked');
    expect(b.element.dataset.zone).toBe('tray');
    expect(liveText(b)).toBe('Sorry, you can no longer make any changes.');

    expect(b.pickUp('on')).toBe(false);
    await expect(b.drop({ chip: 'on' })).rejects.toThrow(/can't pick up/);
    press(b, 'Enter');
    expect(liveText(b)).toBe('Sorry, you can no longer make any changes.');
  });
});

describe('supply', () => {
  interface Counts {
    on: number;
    off: number;
  }
  /** A board whose kinds have these counts. */
  const stocked = (counts: Counts, extra: Partial<PlinkoOptions> = {}) =>
    mount({
      chips: [
        { id: 'on', label: 'On', count: counts.on },
        { id: 'off', label: 'Off', count: counts.off },
      ],
      ...extra,
    });
  /** Lets pending promises (e.g. an async onRequest) finish. */
  const flush = () => vi.advanceTimersByTimeAsync(0);

  it('reports counts on mount, counts a chip in hand as used, and gives it back on Escape', () => {
    const onSupplyChange = vi.fn();
    stocked({ on: 2, off: Infinity }, { onSupplyChange });
    const b = boards[0] as PlinkoBoard;
    expect(onSupplyChange).toHaveBeenLastCalledWith({ counts: { on: 2, off: Infinity } });
    press(b, 'Enter');
    expect(b.supply.get()).toEqual({ counts: { on: 1, off: Infinity } });
    press(b, 'Escape');
    expect(onSupplyChange).toHaveBeenLastCalledWith({ counts: { on: 2, off: Infinity } });
    expect(onSupplyChange).toHaveBeenCalledTimes(3);
  });

  it('announces how many are left when choosing a kind', () => {
    const b = stocked({ on: 3, off: 0 });
    press(b, 'ArrowRight');
    expect(liveText(b)).toBe('Off chip, none left.');
    press(b, 'ArrowLeft');
    expect(liveText(b)).toBe('On chip, 3 left.');
  });

  it('spends dropped chips and reports the last one', () => {
    const onExhausted = vi.fn();
    const b = stocked({ on: 2, off: Infinity }, { onExhausted });
    press(b, 'Enter');
    carryUp(b);
    press(b, 'Enter'); // drop; auto-reload picks up the last one, still in the drop zone
    expect(onExhausted).not.toHaveBeenCalled();
    press(b, 'Enter'); // drop the last one
    expect(onExhausted).toHaveBeenCalledWith({ chip: expect.objectContaining({ id: 'on' }) });
    expect(liveText(b)).toBe('Out of On chips.');
    expect(b.supply.get().counts.on).toBe(0);
  });

  it('locks when every chip is spent and none can come back', () => {
    const onFull = vi.fn();
    const b = stocked({ on: 1, off: 0 }, { onFull });
    press(b, 'Enter');
    carryUp(b);
    press(b, 'Enter');
    expect(onFull).toHaveBeenCalledWith({ reason: 'exhausted' });
    expect(b.element.dataset.state).toBe('locked');
    expect(liveText(b)).toBe('Sorry, you can no longer make any changes.');
  });

  it('locks straight away when there are no chips at all', () => {
    const onFull = vi.fn();
    const b = stocked({ on: 0, off: 0 }, { onFull });
    expect(onFull).toHaveBeenCalledWith({ reason: 'exhausted' });
    expect(b.element.dataset.state).toBe('locked');
  });

  it('host overrides change counts, report, and can exhaust the board', () => {
    const onSupplyChange = vi.fn();
    const b = stocked({ on: 1, off: 1 }, { onSupplyChange });
    b.supply.add({ chip: 'on', amount: 4 });
    b.supply.set({ chip: 'off', count: 0 });
    expect(onSupplyChange).toHaveBeenLastCalledWith({ counts: { on: 5, off: 0 } });
    b.supply.set({ chip: 'on', count: 0 });
    expect(b.element.dataset.state).toBe('locked');
  });

  it('refills on an interval, up to the starting count', () => {
    const b = stocked(
      { on: 2, off: 0 },
      { supply: { refill: { mode: 'interval', everyMs: 1000 } } },
    );
    b.supply.set({ chip: 'on', count: 0 });
    run(1000);
    expect(b.supply.get().counts.on).toBe(1);
    run(5000);
    expect(b.supply.get().counts).toEqual({ on: 2, off: 0 }); // off started at 0: its cap
    expect(b.element.dataset.state).toBe('idle'); // refillable, so never exhausted
  });

  describe('requests', () => {
    const onRequest = { supply: { refill: { mode: 'onRequest' } } } as const;

    it('Enter on an empty kind asks the host, then refills on grant', async () => {
      const ask = vi.fn(async () => 'grant' as const);
      const b = stocked({ on: 2, off: 0 }, { ...onRequest, onRequest: ask });
      press(b, 'ArrowRight');
      expect(liveText(b)).toBe('Off chip, none left. Press Enter to request more.');
      press(b, 'Enter');
      expect(liveText(b)).toBe('Requesting more Off chips…');
      press(b, 'Enter'); // still pending: no second request
      await flush();
      expect(ask).toHaveBeenCalledTimes(1);
      expect(ask).toHaveBeenCalledWith({ chip: expect.objectContaining({ id: 'off' }) });
      expect(liveText(b)).toBe('Request granted: more Off chips.');
      expect(b.supply.get().counts.off).toBe(0); // the cap is the starting count: 0
    });

    it('grants up to the starting count when the host has no callback', async () => {
      const b = stocked({ on: 3, off: 1 }, onRequest);
      b.supply.set({ chip: 'on', count: 0 });
      await expect(b.supply.request({ chip: 'on' })).resolves.toBe('grant');
      expect(b.supply.get().counts.on).toBe(3);
    });

    it('treats a denial, a junk answer, or a failure as denied', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const answers = [
        () => 'deny' as const,
        () => 'yes please' as never,
        () => Promise.reject(new Error('backend down')),
      ];
      for (const answer of answers) {
        const b = stocked({ on: 0, off: 1 }, { ...onRequest, onRequest: answer });
        await expect(b.supply.request({ chip: 'on' })).resolves.toBe('deny');
        expect(liveText(b)).toBe('Request for more On chips was denied.');
        expect(b.supply.get().counts.on).toBe(0);
      }
      expect(error).toHaveBeenCalledTimes(1);
      error.mockRestore();
    });

    it("denies without asking when a kind isn't requestable", async () => {
      const ask = vi.fn(() => 'grant' as const);
      const b = stocked({ on: 2, off: 0 }, { onRequest: ask }); // policy: never
      await expect(b.supply.request({ chip: 'off' })).resolves.toBe('deny');
      await expect(b.supply.request({ chip: 'nope' })).resolves.toBe('deny');
      expect(ask).not.toHaveBeenCalled();
    });
  });
});

describe('update', () => {
  it('swaps callbacks: the new one fires, the old one never again', () => {
    const before = vi.fn();
    const after = vi.fn();
    const b = mount({ onDrop: before });
    b.update({ onDrop: after });
    void b.drop({ chip: 'on' });
    expect(before).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledOnce();
  });

  it('puts new wording on the canvas, the instructions, and announcements', () => {
    const b = mount();
    b.update({ labels: { board: 'Settings, the hard way', instructions: 'Good luck.' } });
    const canvas = canvasOf(b);
    expect(canvas.getAttribute('aria-label')).toBe('Settings, the hard way');
    const describedBy = canvas.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toBe('Good luck.');
    b.update({ labels: { cancelled: ({ chip }) => `${chip.label}: back you go.` } });
    press(b, 'Enter');
    press(b, 'Escape');
    expect(liveText(b)).toBe('On: back you go.');
  });

  it('applies new keys, step sizes, and autoReload', () => {
    const onDrop = vi.fn();
    const b = mount({ onDrop });
    b.update({ keys: { drop: ['d'] }, liftStep: 1, autoReload: false });
    press(b, 'Enter');
    press(b, 'ArrowUp'); // one step: straight into the drop zone
    press(b, 'd');
    expect(onDrop).toHaveBeenCalledOnce();
    expect(b.element.dataset.state).toBe('idle'); // no reload
  });

  it('applies maxInFlight', async () => {
    const b = mount();
    b.update({ maxInFlight: 1 });
    void b.drop({ chip: 'on' });
    await expect(b.drop({ chip: 'on' })).rejects.toThrow(/can't drop/);
  });

  it('sets an option back to its default when given undefined', () => {
    const onDrop = vi.fn();
    const b = mount({ onDrop, keys: { drop: ['d'] }, liftStep: 1 });
    b.update({ keys: undefined });
    press(b, 'Enter');
    press(b, 'ArrowUp');
    press(b, 'Enter'); // the default drop key again
    expect(onDrop).toHaveBeenCalledOnce();
  });

  it('refuses mount-only options and changes nothing', () => {
    const before = vi.fn();
    const after = vi.fn();
    const b = mount({ onPickUp: before });
    const sneaky = { onPickUp: after, slots: [], attribution: false } as Parameters<
      typeof b.update
    >[0];
    expect(() => b.update(sneaky)).toThrow(PlinkoConfigError);
    expect(() => b.update(sneaky)).toThrow(/can't change slots, attribution/);
    press(b, 'Enter');
    expect(before).toHaveBeenCalledOnce();
    expect(after).not.toHaveBeenCalled();
  });

  it('refuses invalid values and changes nothing', () => {
    const b = mount();
    expect(() => b.update({ aimStep: 2, labels: { board: 'changed' } })).toThrow(/aimStep/);
    expect(canvasOf(b).getAttribute('aria-label')).toBe('Plinko preferences board');
  });

  it('does nothing after destroy', () => {
    const b = mount();
    b.destroy();
    expect(() => b.update({ aimStep: 0.5 })).not.toThrow();
  });
});

describe('styles', () => {
  it('refuses styles for slots or chips that are not on the board, at mount and on update', () => {
    expect(() => mount({ styles: { slots: { emial: { fill: 'red' } } } })).toThrow(
      /styles.slots has no slot with id emial/,
    );
    const b = mount();
    expect(() =>
      b.update({ styles: { chips: { maybe: {} } }, labels: { board: 'changed' } }),
    ).toThrow(/styles.chips has no chip with id maybe/);
    // Nothing changed: a bad update is all or nothing.
    expect(canvasOf(b).getAttribute('aria-label')).toBe('Plinko preferences board');
  });

  it('accepts styles for real slots and chips, at mount and live', () => {
    const b = mount({
      styles: {
        text: { fontFamily: 'Georgia, serif' },
        slots: { email: { fill: 'rgba(62, 199, 168, 0.2)', label: { color: '#3ec7a8' } } },
      },
    });
    expect(() =>
      b.update({ styles: { chips: { on: { fill: '#3ec7a8', stroke: '#fff' } } } }),
    ).not.toThrow();
  });
});

describe('motion', () => {
  /** A stand-in for the visitor's reduced-motion setting that can change while the board runs. */
  function fakeReducedMotionQuery(matches: boolean) {
    const listeners = new Set<() => void>();
    const query = {
      matches,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
    window.matchMedia = (() => query) as unknown as typeof window.matchMedia;
    return {
      change(next: boolean) {
        query.matches = next;
        for (const fn of listeners) fn();
      },
      listeners,
    };
  }
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('reduced: a dropped chip settles on the next frame, not after the fall', () => {
    const settled = vi.fn();
    const b = mount({ motion: 'reduced', onLand: settled, onMiss: settled });
    void b.drop({ chip: 'on', x: 0.5 });
    expect(settled).not.toHaveBeenCalled(); // never inside drop() itself
    run(20); // one frame
    expect(settled).toHaveBeenCalledOnce();
  });

  it('full: the same drop is still falling a frame later', () => {
    const settled = vi.fn();
    const b = mount({ motion: 'full', onLand: settled, onMiss: settled });
    void b.drop({ chip: 'on', x: 0.5 });
    run(20);
    expect(settled).not.toHaveBeenCalled();
  });

  it('lands a seeded drop in the same slot either way', () => {
    const slotWith = (motion: 'full' | 'reduced') => {
      const onLand = vi.fn();
      const b = mount({ motion, onLand });
      void b.drop({ chip: 'on', x: 0.37, seed: 42 });
      run(20_000);
      const slot = (onLand.mock.calls[0]?.[0] as { slot: { id: string } } | undefined)?.slot.id;
      b.destroy();
      return slot;
    };
    const animated = slotWith('full');
    expect(animated).toBeDefined(); // it really landed, so the comparison means something
    expect(slotWith('reduced')).toBe(animated);
  });

  it("'auto' follows the visitor's setting, live, and stops following on destroy", () => {
    const visitor = fakeReducedMotionQuery(false);
    const settled = vi.fn();
    const b = mount({ onLand: settled, onMiss: settled });
    visitor.change(true);
    void b.drop({ chip: 'on' });
    run(20);
    expect(settled).toHaveBeenCalledOnce();
    b.destroy();
    expect(visitor.listeners.size).toBe(0);
  });

  it('can change with update(), and rejects unknown values', () => {
    const settled = vi.fn();
    const b = mount({ onLand: settled, onMiss: settled });
    b.update({ motion: 'reduced' });
    void b.drop({ chip: 'on' });
    run(20);
    expect(settled).toHaveBeenCalledOnce();
    expect(() => b.update({ motion: 'slow' as 'full' })).toThrow(/motion must be/);
  });
});

describe('destroy', () => {
  it('removes everything and leaves the host as it was', () => {
    const b = mount();
    press(b, 'Enter');
    b.destroy();
    expect(host.childNodes).toHaveLength(0);
    expect(host.getAttribute('style')).toBe('color: red');
    b.destroy(); // idempotent
  });

  it('settles pending drops, since their chips are gone', async () => {
    const b = mount();
    const settled = b.drop({ chip: 'on' });
    b.destroy();
    await expect(settled).resolves.toEqual({ dropId: 0 });
  });

  it('stops reacting to keys and callbacks', () => {
    const onPickUp = vi.fn();
    const b = mount({ onPickUp });
    const canvas = canvasOf(b);
    b.destroy();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(onPickUp).not.toHaveBeenCalled();
    expect(b.pickUp('on')).toBe(false);
  });
});
