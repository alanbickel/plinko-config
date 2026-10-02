import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYS,
  interpretKey,
  type KeyContext,
  type KeyInput,
  resolveKeys,
} from './keyboard';

const ctx = (extra: Partial<KeyContext> = {}): KeyContext => ({
  holding: false,
  selected: 0,
  kindCount: 3,
  aimStep: 0.05,
  aimStepLarge: 0.2,
  liftStep: 0.1,
  liftStepLarge: 0.4,
  keys: DEFAULT_KEYS,
  ...extra,
});
const key = (k: string, shiftKey = false): KeyInput => ({ key: k, shiftKey });

describe('interpretKey: nothing held (tray)', () => {
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

  it('ignores everything else, including Tab, Escape, and up/down', () => {
    for (const k of ['Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'a']) {
      expect(interpretKey(key(k), ctx())).toBeNull();
    }
  });
});

describe('interpretKey: holding a chip (board)', () => {
  const holding = ctx({ holding: true });

  it('moves across by the small step, or the large step with Shift', () => {
    expect(interpretKey(key('ArrowLeft'), holding)).toEqual({ type: 'nudge', dx: -0.05 });
    expect(interpretKey(key('ArrowRight', true), holding)).toEqual({ type: 'nudge', dx: 0.2 });
  });

  it('carries up and down by the lift steps', () => {
    expect(interpretKey(key('ArrowUp'), holding)).toEqual({ type: 'lift', dy: 0.1 });
    expect(interpretKey(key('ArrowDown', true), holding)).toEqual({ type: 'lift', dy: -0.4 });
  });

  it('jumps to the edges', () => {
    expect(interpretKey(key('Home'), holding)).toEqual({ type: 'aim', x: 0 });
    expect(interpretKey(key('End'), holding)).toEqual({ type: 'aim', x: 1 });
  });

  it('drops with Enter or Space (with reload), never with Down; cancels with Escape', () => {
    for (const k of ['Enter', ' ']) {
      expect(interpretKey(key(k), holding)).toEqual({ type: 'drop', reload: true });
    }
    expect(interpretKey(key('ArrowDown'), holding)?.type).toBe('lift');
    expect(interpretKey(key('Escape'), holding)).toEqual({ type: 'cancel' });
  });

  it('never handles Tab', () => {
    expect(interpretKey(key('Tab'), holding)).toBeNull();
  });
});

describe('custom bindings', () => {
  it('replaces only the actions given', () => {
    const keys = resolveKeys({ drop: ['d'], left: ['a'], up: ['w'] });
    const holding = ctx({ holding: true, keys });
    expect(interpretKey(key('d'), holding)).toEqual({ type: 'drop', reload: true });
    expect(interpretKey(key('Enter'), holding)).toBeNull();
    expect(interpretKey(key('a'), holding)).toEqual({ type: 'nudge', dx: -0.05 });
    expect(interpretKey(key('ArrowRight'), holding)).toEqual({ type: 'nudge', dx: 0.05 });
    expect(interpretKey(key('w'), holding)).toEqual({ type: 'lift', dy: 0.1 });
    expect(interpretKey(key('ArrowUp'), holding)).toBeNull();
  });
});
