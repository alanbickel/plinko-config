import { describe, expect, it } from 'vitest';
import { fitWidth } from './sizing';

// Canvas height at a width: the board scales with the width, but rem-sized text strips don't, so
// height isn't proportional to width. These stand-ins cover both shapes.
const proportional = (w: number) => w * 0.75;
/** A 120px text strip and tray under a board half as tall as it's wide. */
const withStrip = (w: number) => w * 0.5 + 120;

describe('fitWidth', () => {
  it('fills the available width when the height fits', () => {
    expect(fitWidth({ available: 600, roomHeight: 1000, heightAt: withStrip })).toBe(600);
    expect(fitWidth({ available: 600, roomHeight: Infinity, heightAt: withStrip })).toBe(600);
  });

  it('narrows to the room when the height is proportional', () => {
    const width = fitWidth({ available: 1000, roomHeight: 300, heightAt: proportional });
    expect(width).toBeCloseTo(400, 0);
  });

  // A fixed aspect read at the available width (the old fit) overshoots: the strip doesn't shrink
  // with the board, so the canvas came out taller than the room.
  it('narrows to the widest canvas whose height fits, when text strips do not scale', () => {
    const width = fitWidth({ available: 1000, roomHeight: 300, heightAt: withStrip });
    expect(withStrip(width)).toBeLessThanOrEqual(300);
    expect(withStrip(width + 1)).toBeGreaterThan(300);
  });

  it('never goes wider than the available width, nor narrower than 1px', () => {
    for (const roomHeight of [0, 50, 119, 121, 400, 10_000]) {
      const width = fitWidth({ available: 500, roomHeight, heightAt: withStrip });
      expect(width).toBeGreaterThanOrEqual(1);
      expect(width).toBeLessThanOrEqual(500);
    }
  });
});
