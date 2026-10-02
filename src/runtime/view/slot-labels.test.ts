import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../core/layout';
import { DEFAULT_BOARD } from '../../core/options';
import type { ResolvedText } from '../styles';
import {
  drawText,
  fitText,
  type Measure,
  type PlanInput,
  planSlotLabels,
  type SlotLabelLayout,
  TEXT_SIZE,
} from './slot-labels';

// A predictable stand-in for font metrics: every character is 0.55 of the font size wide.
const measure: Measure = ({ text, size }) => text.length * size * 0.55;
const style: ResolvedText = { color: '#fff', fontFamily: 'sans-serif', fontWeight: '400' };

const SHORT = ['Ads', 'Sound', 'Map'];
const LONG = ['Email Marketing', 'Dark Mode', 'Push Notifications'];

interface PlanCase {
  labels: string[];
  layout: SlotLabelLayout;
  horizontalWhenFit?: boolean;
}

function plan({ labels, layout, horizontalWhenFit = true }: PlanCase) {
  const input: PlanInput = {
    labels,
    styles: labels.map(() => style),
    options: { layout, horizontalWhenFit },
    layout: buildLayout(labels.length, DEFAULT_BOARD),
    measure,
  };
  return planSlotLabels(input);
}

describe('planSlotLabels', () => {
  it('uses one horizontal line while every label fits, when allowed', () => {
    expect(plan({ labels: SHORT, layout: 'vertical' }).mode).toBe('horizontal');
    expect(plan({ labels: SHORT, layout: 'angled' }).mode).toBe('horizontal');
    expect(plan({ labels: LONG, layout: 'vertical' }).mode).toBe('vertical');
  });

  it('honours the layout exactly when horizontalWhenFit is off, and always for backboard', () => {
    expect(plan({ labels: SHORT, layout: 'vertical', horizontalWhenFit: false }).mode).toBe(
      'vertical',
    );
    expect(plan({ labels: SHORT, layout: 'angled', horizontalWhenFit: false }).mode).toBe('angled');
    expect(plan({ labels: SHORT, layout: 'backboard' }).mode).toBe('backboard');
  });

  it('vertical: the strip grows with the longest label, up to a cap; text up to 0.4', () => {
    const long = plan({ labels: LONG, layout: 'vertical' });
    const short = plan({
      labels: ['Cookies', 'Dark Mode'],
      layout: 'vertical',
      horizontalWhenFit: false,
    });
    expect(long.strip.height).toBeGreaterThan(short.strip.height);
    expect(long.strip.height).toBeLessThanOrEqual(3);
    expect(short.size).toBeLessThanOrEqual(0.4);
    const huge = plan({ labels: ['x'.repeat(200)], layout: 'vertical' });
    expect(huge.strip.height).toBe(3);
  });

  it('angled: leaves room past the right wall for the last label', () => {
    const angled = plan({ labels: LONG, layout: 'angled' });
    expect(angled.strip.extraRight).toBeGreaterThan(0);
    expect(angled.size).toBe(TEXT_SIZE);
  });

  it('backboard: labels run within the slot, with only a thin strip below', () => {
    const backboard = plan({ labels: LONG, layout: 'backboard' });
    const layout = buildLayout(3, DEFAULT_BOARD);
    expect(backboard.extent).toBeLessThan(layout.floorY - layout.railTopY);
    expect(backboard.strip.height).toBeLessThan(
      plan({ labels: SHORT, layout: 'horizontal' }).strip.height,
    );
  });
});

/** Just enough of a 2D context for fitText: measures with the same stand-in metrics. */
function fakeContext(): CanvasRenderingContext2D {
  const g = {
    font: '',
    measureText(text: string) {
      const size = Number(/([\d.]+)px/.exec(g.font)?.[1] ?? 0);
      return { width: text.length * size * 0.55 };
    },
  };
  return g as unknown as CanvasRenderingContext2D;
}

describe('fitText', () => {
  const g = fakeContext();

  it('keeps text that fits at its size', () => {
    expect(fitText({ g, text: 'Ads', style, size: 0.26, maxWidth: 1, minSize: 0.1 })).toEqual({
      text: 'Ads',
      size: 0.26,
    });
  });

  it('shrinks text to fit, but never below the minimum', () => {
    const shrunk = fitText({ g, text: 'Cookies!', style, size: 0.26, maxWidth: 0.9, minSize: 0.1 });
    expect(shrunk.text).toBe('Cookies!');
    expect(shrunk.size).toBeLessThan(0.26);
    expect(shrunk.size).toBeGreaterThanOrEqual(0.1);
  });

  it('cuts text with an ellipsis once it would go below the minimum', () => {
    const cut = fitText({
      g,
      text: 'Push Notifications',
      style,
      size: 0.26,
      maxWidth: 0.9,
      minSize: 0.2,
    });
    expect(cut.size).toBe(0.2);
    expect(cut.text.endsWith('…')).toBe(true);
    expect(cut.text.length * cut.size * 0.55).toBeLessThanOrEqual(0.9);
  });
});

describe('drawText', () => {
  // Firefox draws nothing for fonts under 1px, whatever the transform.
  it('never hands the canvas a font under 1px, and scales back to the board-unit size', () => {
    const drawn: { font: string; scale: number }[] = [];
    let scale = 1;
    const g = {
      font: '',
      save() {},
      restore() {
        scale = 1;
      },
      scale(by: number) {
        scale *= by;
      },
      fillText() {
        drawn.push({ font: g.font, scale });
      },
    };
    drawText(g as unknown as CanvasRenderingContext2D, {
      text: 'Ads',
      size: 0.26,
      style,
      align: 'center',
    });
    const [call] = drawn;
    const px = Number(/([\d.]+)px/.exec(call?.font ?? '')?.[1]);
    expect(px).toBeGreaterThanOrEqual(1);
    expect(px * (call?.scale ?? 0)).toBeCloseTo(0.26);
  });
});
