import { describe, expect, it } from 'vitest';
import {
  bannerLayout,
  type TextScale,
  TRAY_CHIP_DY,
  TRAY_CHIP_R,
  type TrayLayout,
  trayLayout,
} from './geometry';

// The sizing contract (site/contracts/sizing.md, "Text size"): tray captions 0.875rem, notes
// 0.75rem (the floor), the banner 1.125rem. Each line needs this many text sizes of height.
const CAPTION_REM = 0.875;
const NOTE_REM = 0.75;
const BANNER_REM = 1.125;
const LINE = 1.1;

/** CSS pixels per board unit: a phone's crowded board up to a wide desktop's few slots. */
const UNITS = [5, 10, 20, 40, 80, 150];
const REMS = [16, 20, 32];
const SCALES: TextScale[] = UNITS.flatMap((unit) => REMS.map((remPx) => ({ unit, remPx })));

const name = ({ unit, remPx }: TextScale) => `${unit}px a unit, rem ${remPx}`;

/** Names of the scales that break a rule. */
const breaking = (rule: (s: TextScale) => boolean) => SCALES.filter((s) => !rule(s)).map(name);

/** A text line's top and bottom, board units from the top of the tray. */
const span = (y: number, size: number) => ({
  top: y - (LINE * size) / 2,
  bottom: y + (LINE * size) / 2,
});

function lines(tray: TrayLayout) {
  return { caption: span(tray.captionY, tray.captionSize), note: span(tray.noteY, tray.noteSize) };
}

describe('trayLayout', () => {
  it('sizes captions at 0.875rem and notes at 0.75rem', () => {
    const rule = (s: TextScale) => {
      const tray = trayLayout(s);
      const px = (size: number) => size * s.unit;
      const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
      return (
        near(px(tray.captionSize), CAPTION_REM * s.remPx) &&
        near(px(tray.noteSize), NOTE_REM * s.remPx)
      );
    };
    expect(breaking(rule)).toEqual([]);
  });

  it('stacks chips, caption and note without overlap, all inside the tray', () => {
    const rule = (s: TextScale) => {
      const tray = trayLayout(s);
      const { caption, note } = lines(tray);
      const chipBottom = TRAY_CHIP_DY + TRAY_CHIP_R;
      const inOrder = (a: number, b: number) => a <= b + 1e-9;
      return (
        inOrder(chipBottom, caption.top) &&
        inOrder(caption.bottom, note.top) &&
        inOrder(note.bottom, tray.height)
      );
    };
    expect(breaking(rule)).toEqual([]);
  });

  it('grows with the root font size, so larger text gets its room', () => {
    const rule = ({ unit, remPx }: TextScale) =>
      remPx === 16 || trayLayout({ unit, remPx }).height > trayLayout({ unit, remPx: 16 }).height;
    expect(breaking(rule)).toEqual([]);
  });
});

describe('bannerLayout', () => {
  it('sizes the banner at 1.125rem, on a band at least a line tall', () => {
    const rule = (s: TextScale) => {
      const banner = bannerLayout(s);
      const sized = Math.abs(banner.size * s.unit - BANNER_REM * s.remPx) < 1e-9;
      return sized && banner.band >= LINE * banner.size;
    };
    expect(breaking(rule)).toEqual([]);
  });
});
