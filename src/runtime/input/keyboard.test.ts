import { describe, expect, it } from 'vitest';
import { interpretKey, type KeyContext, resolveKeys } from './keyboard';

const ctx = (extra: Partial<KeyContext> = {}): KeyContext => ({
  zone: 'tray',
  holding: false,
  selected: 0,
  kindCount: 3,
  lastKindIndex: undefined,
  aimStep: 0.05,
  aimStepLarge: 0.2,
  ...extra,
});
const key = (k: string, shiftKey = false) => ({ key: k, shiftKey });

describe('interpretKey: tray zone', () => {
  it('cycles the selection with wrap-around', () => {
    expect(interpretKey(key('ArrowRight'), ctx({ selected: 2 }))).toEqual({
      type: 'select',
      index: 0,
    });
    expect(interpretKey(key('ArrowLeft'), ctx({ selected: 0 }))).toEqual({
      type: 'select',
      index: 2,
    });
  });

  it('picks up the selected kind with Enter or Space', () => {
    expect(interpretKey(key('Enter'), ctx({ selected: 1 }))).toEqual({ type: 'pickUp', index: 1 });
    expect(interpretKey(key(' '), ctx({ selected: 1 }))).toEqual({ type: 'pickUp', index: 1 });
  });

  it('ignores everything else, including Tab and Escape', () => {
    for (const k of ['Tab', 'Escape', 'ArrowDown', 'a']) {
      expect(interpretKey(key(k), ctx())).toBeNull();
    }
  });
});

describe('interpretKey: board zone, holding', () => {
  const holding = ctx({ zone: 'board', holding: true });

  it('nudges by the small step, or the large step with Shift', () => {
    expect(interpretKey(key('ArrowLeft'), holding)).toEqual({ type: 'nudge', dx: -0.05 });
    expect(interpretKey(key('ArrowRight', true), holding)).toEqual({ type: 'nudge', dx: 0.2 });
  });

  it('jumps to the edges', () => {
    expect(interpretKey(key('Home'), holding)).toEqual({ type: 'aim', x: 0 });
    expect(interpretKey(key('End'), holding)).toEqual({ type: 'aim', x: 1 });
  });

  it('drops with Enter, Space, or Down; cancels with Escape', () => {
    for (const k of ['Enter', ' ', 'ArrowDown']) {
      expect(interpretKey(key(k), holding)).toEqual({ type: 'drop' });
    }
    expect(interpretKey(key('Escape'), holding)).toEqual({ type: 'cancel' });
  });

  it('never handles Tab', () => {
    expect(interpretKey(key('Tab'), holding)).toBeNull();
  });
});

describe('interpretKey: board zone, empty-handed', () => {
  const empty = ctx({ zone: 'board', holding: false, selected: 0, lastKindIndex: 2 });

  it('Enter picks up the most recently used kind', () => {
    expect(interpretKey(key('Enter'), empty)).toEqual({ type: 'pickUp', index: 2 });
  });

  it('Escape returns to the tray', () => {
    expect(interpretKey(key('Escape'), empty)).toEqual({ type: 'zone', zone: 'tray' });
  });

  it('arrows do nothing', () => {
    expect(interpretKey(key('ArrowLeft'), empty)).toBeNull();
  });
});

describe('custom bindings', () => {
  it('replaces only the actions given', () => {
    const keys = resolveKeys({ drop: ['d'], left: ['a'] });
    const holding = ctx({ zone: 'board', holding: true });
    expect(interpretKey(key('d'), holding, keys)).toEqual({ type: 'drop' });
    expect(interpretKey(key('Enter'), holding, keys)).toBeNull();
    expect(interpretKey(key('a'), holding, keys)).toEqual({ type: 'nudge', dx: -0.05 });
    expect(interpretKey(key('ArrowRight'), holding, keys)).toEqual({ type: 'nudge', dx: 0.05 });
  });
});
