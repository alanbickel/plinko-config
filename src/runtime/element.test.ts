// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { PlinkoConfigError } from '../core/validate';
import { definePlinkoBoard, PlinkoBoardElement } from './element';
import type { ChipDetails, PlinkoOptions } from './types';

const options = (extra: Partial<PlinkoOptions> = {}): PlinkoOptions => ({
  slots: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  chips: [{ id: 'on', label: 'On' }],
  physics: { seed: 1 },
  ...extra,
});

let el: PlinkoBoardElement;
const wrapperIn = (element: PlinkoBoardElement) =>
  element.shadowRoot?.querySelector('.plinko-config') ?? null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame', 'performance'] });
  definePlinkoBoard();
  el = document.createElement('plinko-board');
});

afterEach(() => {
  el.remove();
  vi.useRealTimers();
});

describe('registration', () => {
  it('registers <plinko-board> once, and other tags as their own subclass', () => {
    expect(customElements.get('plinko-board')).toBe(PlinkoBoardElement);
    expect(() => definePlinkoBoard()).not.toThrow();
    definePlinkoBoard('settings-board');
    const custom = document.createElement('settings-board');
    expect(custom).toBeInstanceOf(PlinkoBoardElement);
  });
});

describe('lifecycle', () => {
  it('mounts in its shadow root once it has options and is connected, in either order', () => {
    el.options = options();
    expect(el.board).toBeUndefined();
    document.body.append(el);
    expect(el.board).toBeDefined();
    expect(wrapperIn(el)).not.toBeNull();

    const late = document.createElement('plinko-board');
    document.body.append(late);
    expect(late.board).toBeUndefined();
    late.options = options();
    expect(wrapperIn(late)).not.toBeNull();
    late.remove();
  });

  it('destroys the board when disconnected or when options are cleared', () => {
    el.options = options();
    document.body.append(el);
    el.remove();
    expect(el.board).toBeUndefined();
    expect(wrapperIn(el)).toBeNull();
    document.body.append(el);
    el.options = undefined;
    expect(wrapperIn(el)).toBeNull();
  });

  it('updates the live board for live options, keeping the same board', () => {
    el.options = options();
    document.body.append(el);
    const board = el.board;
    el.options = options({ labels: { board: 'Renamed' } });
    expect(el.board).toBe(board);
    expect(wrapperIn(el)?.querySelector('canvas')?.getAttribute('aria-label')).toBe('Renamed');
  });

  it('treats equal mount-only options as unchanged, even as new objects', () => {
    el.options = options();
    document.body.append(el);
    const board = el.board;
    el.options = options(); // fresh arrays, same values: no remount, piles kept
    expect(el.board).toBe(board);
  });

  it('remounts when a mount-only option changes value', () => {
    el.options = options();
    document.body.append(el);
    const board = el.board;
    el.options = options({ slots: [{ id: 'z', label: 'Z' }] });
    expect(el.board).not.toBe(board);
    expect(wrapperIn(el)?.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('throws a readable error for bad options', () => {
    document.body.append(el);
    expect(() => {
      el.options = options({ slots: [] });
    }).toThrow(PlinkoConfigError);
  });
});

describe('events', () => {
  it('fires each callback as a bubbling, composed plinko-* event, and still calls the callback', () => {
    const onPickUp = vi.fn();
    const heard = vi.fn();
    document.body.addEventListener('plinko-pick-up', heard);
    el.options = options({ onPickUp });
    document.body.append(el);
    el.board?.pickUp('on');
    expect(onPickUp).toHaveBeenCalledOnce();
    const event = heard.mock.calls[0]?.[0] as CustomEvent;
    expect(event.detail).toEqual({ chip: expect.objectContaining({ id: 'on' }) });
    expect(event.composed).toBe(true);
    document.body.removeEventListener('plinko-pick-up', heard);
  });

  it('keeps firing events after an update replaces the callbacks', () => {
    const heard = vi.fn();
    el.addEventListener('plinko-drop', heard);
    el.options = options();
    document.body.append(el);
    el.options = options({ onDrop: vi.fn() });
    void el.board?.drop({ chip: 'on' });
    expect(heard).toHaveBeenCalledOnce();
  });

  it('types listener details from the element’s chip and slot value types', () => {
    const typed = el as PlinkoBoardElement<boolean, 'a' | 'b'>;
    typed.options = {
      slots: [
        { id: 'a', label: 'A', value: 'a' },
        { id: 'b', label: 'B', value: 'b' },
      ],
      chips: [{ id: 'on', label: 'On', value: true }],
      physics: { seed: 1 },
    };
    const values: boolean[] = [];
    const onPickUp = (event: CustomEvent<ChipDetails<boolean>>) => {
      if (event.detail.chip.value !== undefined) values.push(event.detail.chip.value);
    };
    typed.addEventListener('plinko-land', (event) => {
      expectTypeOf(event.detail.chip.value).toEqualTypeOf<boolean | undefined>();
      expectTypeOf(event.detail.slot.value).toEqualTypeOf<'a' | 'b' | undefined>();
    });
    typed.addEventListener('keydown', (event) =>
      expectTypeOf(event).toEqualTypeOf<KeyboardEvent>(),
    );
    typed.addEventListener('plinko-pick-up', onPickUp);
    document.body.append(typed);
    typed.board?.pickUp('on');
    typed.removeEventListener('plinko-pick-up', onPickUp);
    typed.board?.pickUp('on');
    expect(values).toEqual([true]);
  });
});
