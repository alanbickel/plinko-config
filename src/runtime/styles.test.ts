import { describe, expect, it } from 'vitest';
import { PlinkoConfigError } from '../core/validate';
import { fontOf, resolveStyles, type Styles } from './styles';
import { DEFAULT_THEME } from './theme';

const resolve = (styles: Styles | undefined) =>
  resolveStyles({
    styles,
    theme: DEFAULT_THEME,
    slotIds: ['email', 'push'],
    chipIds: ['on', 'off'],
  });

describe('resolveStyles', () => {
  it('falls back to the theme for everything left out', () => {
    const r = resolve(undefined);
    expect(r.text).toEqual({
      color: DEFAULT_THEME.text,
      fontFamily: 'system-ui, sans-serif',
      fontWeight: '400',
    });
    expect(r.mutedText.color).toBe(DEFAULT_THEME.mutedText);
    expect(r.slots).toEqual([
      { fill: undefined, label: r.text },
      { fill: undefined, label: r.text },
    ]);
    expect(r.chips[0]).toEqual({
      fill: DEFAULT_THEME.chip,
      stroke: DEFAULT_THEME.chipStroke,
      label: r.text,
    });
  });

  it('layers per-item styles over the board-wide text style', () => {
    const r = resolve({
      text: { fontFamily: 'Inter', fontWeight: 600 },
      slots: { push: { fill: '#123', label: { color: 'pink' } } },
      chips: { off: { fill: '#e06', label: { fontWeight: 'bold' } } },
    });
    expect(r.text).toMatchObject({ fontFamily: 'Inter', fontWeight: '600' });
    expect(r.mutedText).toMatchObject({ fontFamily: 'Inter', color: DEFAULT_THEME.mutedText });
    expect(r.slots[0]).toEqual({ fill: undefined, label: r.text });
    expect(r.slots[1]).toEqual({ fill: '#123', label: { ...r.text, color: 'pink' } });
    expect(r.chips[1]).toMatchObject({
      fill: '#e06',
      label: { fontFamily: 'Inter', fontWeight: 'bold' },
    });
  });

  it('refuses ids that are not on the board, naming them', () => {
    expect(() => resolve({ slots: { emial: { fill: 'red' } } })).toThrow(PlinkoConfigError);
    expect(() => resolve({ slots: { emial: {} } })).toThrow(
      /styles.slots has no slot with id emial/,
    );
    expect(() => resolve({ chips: { maybe: {} } })).toThrow(
      /styles.chips has no chip with id maybe/,
    );
  });
});

describe('fontOf', () => {
  it('builds a canvas font string in board units', () => {
    expect(fontOf({ color: '', fontFamily: 'Inter', fontWeight: '600' }, 0.26)).toBe(
      '600 0.26px Inter',
    );
  });
});
