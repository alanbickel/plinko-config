// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlinkoConfigError } from '../core/options';
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
const press = (b: PlinkoBoard, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  canvasOf(b).dispatchEvent(event);
  return event;
};
/** Runs the frame loop for this much simulated time. */
const run = (ms: number) => vi.advanceTimersByTime(ms);

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
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
    const b = mount({ labels: { board: 'Preferences', pickedUp: (c) => `Got ${c.label}` } });
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
    expect(onPickUp).toHaveBeenCalledWith(expect.objectContaining({ id: 'off' }));
    expect(b.element.dataset).toMatchObject({ state: 'holding', zone: 'board' });
    expect(liveText(b)).toMatch(/Picked up an Off chip/);

    press(b, 'End');
    press(b, 'ArrowLeft', { shiftKey: true });
    press(b, 'Enter');
    expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ id: 'off' }), {
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
    expect(press(b, 'Enter', { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('honours custom bindings and step sizes', () => {
    const onDrop = vi.fn();
    const b = mount({ keys: { drop: ['d'] }, aimStep: 0.01, onDrop });
    press(b, 'Enter');
    press(b, 'ArrowRight');
    press(b, 'Enter'); // not a drop key any more
    expect(onDrop).not.toHaveBeenCalled();
    press(b, 'd');
    expect(onDrop).toHaveBeenCalledWith(expect.anything(), { dropId: 0, dropX: 0.51 });
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
    const [chip, slot, details] = onLand.mock.calls[0] ?? [];
    expect(chip.id).toBe('on');
    expect(['email', 'dark', 'cookies']).toContain(slot.id);
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
