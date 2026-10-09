// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlinko } from '../board';
import type { PlinkoBoard, PlinkoOptions } from '../types';

// jsdom has no layout: the canvas sits at (0, 0) and is the fallback 300px wide, so client
// coordinates are canvas coordinates. Two kinds: the tray's left half is On, the right half Off.

const options = (extra: Partial<PlinkoOptions> = {}): PlinkoOptions => ({
  slots: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ],
  chips: [
    { id: 'on', label: 'On' },
    { id: 'off', label: 'Off' },
  ],
  physics: { seed: 1 },
  ...extra,
});

let host: HTMLElement;
let board: PlinkoBoard;
const canvas = () => board.element.querySelector('canvas') as HTMLCanvasElement;
const width = () => parseFloat(canvas().style.width);
const height = () => parseFloat(canvas().style.height);
const state = () => board.element.dataset.state;
const liveText = () =>
  (board.element.querySelector('[aria-live]')?.textContent ?? '').replace(/​/g, '');

interface Spot {
  x: number;
  y: number;
}
const trayChip = (index: number): Spot => ({ x: width() * (index ? 0.75 : 0.25), y: height() - 4 });
/** Over the board, a fraction of the way across; at the top (in the drop zone) unless given. */
const overBoard = (fraction: number, y = 4): Spot => ({ x: width() * fraction, y });
/** Half-way down the board: well below the drop zone. */
const midBoard = (): Spot => overBoard(0.5, height() / 2);
const offCanvas: Spot = { x: 10, y: -50 };

/** Dispatches a pointer event at a spot, plus any extra event fields. */
function pointer(type: string, { x, y, ...init }: Spot & PointerEventInit): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerId: 1,
    clientX: x,
    clientY: y,
    ...init,
  });
  canvas().dispatchEvent(event);
  return event;
}
const click = (at: Spot) => {
  pointer('pointerdown', at);
  pointer('pointerup', at);
};
const drag = (from: Spot, to: Spot) => {
  pointer('pointerdown', from);
  pointer('pointermove', { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
  pointer('pointermove', to);
  pointer('pointerup', to);
};

const mount = (extra: Partial<PlinkoOptions> = {}) => {
  board = createPlinko(host, options(extra));
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'performance'] });
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  board.destroy();
  host.remove();
  vi.useRealTimers();
});

const counts = () => board.supply.get().counts;

describe('drag', () => {
  it('from the tray into the drop zone drops where it is released, without reloading', () => {
    const onPickUp = vi.fn();
    const onDrop = vi.fn();
    mount({ onPickUp, onDrop }); // autoReload is on by default: pointer drops ignore it
    pointer('pointerdown', trayChip(1));
    expect(onPickUp).toHaveBeenCalledWith({ chip: expect.objectContaining({ id: 'off' }) });
    expect(state()).toBe('holding');
    drag(trayChip(1), overBoard(0.5));
    expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ dropX: expect.closeTo(0.5, 1) }));
    expect(state()).toBe('idle');
  });

  it('announces entering and leaving the drop zone', () => {
    mount();
    pointer('pointerdown', trayChip(0));
    pointer('pointermove', overBoard(0.5));
    vi.advanceTimersByTime(500);
    expect(liveText()).toContain('Over the drop zone');
    pointer('pointermove', midBoard());
    vi.advanceTimersByTime(500);
    expect(liveText()).toContain('Left the drop zone');
  });

  it('released below the drop zone loses the chip: spent, no drop callbacks, announced', () => {
    const onDrop = vi.fn();
    const onLand = vi.fn();
    const onMiss = vi.fn();
    const onSupplyChange = vi.fn();
    mount({ chips: [{ id: 'on', label: 'On', count: 3 }], onDrop, onLand, onMiss, onSupplyChange });
    drag(trayChip(0), midBoard());
    vi.advanceTimersByTime(5000);
    expect(onDrop).not.toHaveBeenCalled();
    expect(onLand).not.toHaveBeenCalled();
    expect(onMiss).not.toHaveBeenCalled();
    expect(onSupplyChange).toHaveBeenLastCalledWith({ counts: { on: 2 } });
    expect(liveText()).toContain('The On chip fell off the board.');
    expect(state()).toBe('idle');
  });

  it('released off the canvas loses the chip too', () => {
    mount({ chips: [{ id: 'on', label: 'On', count: 3 }] });
    drag(trayChip(0), offCanvas);
    expect(counts()).toEqual({ on: 2 });
  });

  it('released over the tray puts the chip back', () => {
    mount({ chips: [{ id: 'on', label: 'On', count: 3 }] });
    drag(trayChip(0), midBoard());
    drag(trayChip(0), trayChip(0));
    expect(counts()).toEqual({ on: 2 }); // only the first was lost
    expect(state()).toBe('idle');
  });

  it('losing the last chip exhausts the kind', () => {
    const onExhausted = vi.fn();
    const onFull = vi.fn();
    mount({ chips: [{ id: 'on', label: 'On', count: 1 }], onExhausted, onFull });
    drag(trayChip(0), midBoard());
    expect(onExhausted).toHaveBeenCalledOnce();
    expect(onFull).toHaveBeenCalledWith({ reason: 'exhausted' });
  });

  it('cancelled by the browser puts the chip back', () => {
    mount({ chips: [{ id: 'on', label: 'On', count: 3 }] });
    pointer('pointerdown', trayChip(0));
    pointer('pointermove', midBoard());
    pointer('pointercancel', midBoard());
    expect(state()).toBe('idle');
    expect(counts()).toEqual({ on: 3 });
  });
});

describe('tap', () => {
  it('on a tray chip does nothing: the chip goes straight back', () => {
    const onDrop = vi.fn();
    mount({ chips: [{ id: 'on', label: 'On', count: 3 }], onDrop });
    click(trayChip(0));
    expect(state()).toBe('idle');
    expect(counts()).toEqual({ on: 3 });
    click(overBoard(0.5));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('on an empty kind that can be requested asks for more', () => {
    const onRequest = vi.fn(() => 'deny' as const);
    mount({
      chips: [
        { id: 'on', label: 'On', count: 0 },
        { id: 'off', label: 'Off' },
      ],
      supply: { refill: { mode: 'onRequest' } },
      onRequest,
    });
    click(trayChip(0));
    expect(onRequest).toHaveBeenCalledOnce();
    expect(state()).toBe('idle');
  });
});

describe('presses', () => {
  it('take focus, and ignore other buttons and pointers', () => {
    mount();
    pointer('pointerdown', { ...trayChip(0), button: 2 });
    pointer('pointerdown', { ...trayChip(0), isPrimary: false });
    expect(state()).toBe('idle');
    const down = pointer('pointerdown', trayChip(0));
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(canvas());
  });

  it('bring the board into view on a pickup', () => {
    mount();
    const scrollIntoView = vi.fn();
    canvas().scrollIntoView = scrollIntoView;
    pointer('pointerdown', trayChip(0));
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }));
  });
});

describe('locked board', () => {
  it('ignores the pointer, but a pickup repeats why', () => {
    mount({ chips: [{ id: 'on', label: 'On', count: 0 }] });
    expect(state()).toBe('locked');
    click(trayChip(0));
    vi.advanceTimersByTime(1000);
    expect(liveText()).toContain('no longer make any changes');
    expect(state()).toBe('locked');
  });
});

describe('destroy', () => {
  it('removes the pointer listeners', () => {
    const onPickUp = vi.fn();
    mount({ onPickUp });
    const el = canvas();
    board.destroy();
    el.dispatchEvent(new PointerEvent('pointerdown', { isPrimary: true, clientX: 75, clientY: 1 }));
    expect(onPickUp).not.toHaveBeenCalled();
  });
});
