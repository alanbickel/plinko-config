import type { Locator, Page } from '@playwright/test';
import { countOf, expect, mountBoard, test } from './fixtures';

// The default harness board (five slots; On and Off chips). Taps are real touch input on the
// mobile project and clicks on desktop. Playwright can't drag by touch, so drags use the mouse
// (desktop only); the user checks touch drags and taps by hand on a touchscreen.

const board = (page: Page) => page.locator('#host .plinko-config');
const canvas = (page: Page) => page.locator('#host canvas');
const lastAnnouncement = (page: Page) => page.locator('#transcript li').last();

interface Spot {
  x: number;
  y: number;
}

/** Spots on the canvas, relative to its top-left corner. */
async function spots(page: Page) {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('canvas not laid out');
  return {
    /** Tray chip 0 (On) or 1 (Off), on the tray's bottom edge. */
    trayChip: (index: number): Spot => ({
      x: box.width * (index ? 0.75 : 0.25),
      y: box.height - 6,
    }),
    /** Above the pegs, a fraction of the way across. */
    overBoard: (fraction: number): Spot => ({ x: box.width * fraction, y: box.height * 0.03 }),
    /** In page coordinates, for page.mouse. */
    onPage: ({ x, y }: Spot): Spot => ({ x: box.x + x, y: box.y + y }),
  };
}

async function tapOrClick(target: Locator, { position, isMobile }: TapInput): Promise<void> {
  await (isMobile ? target.tap({ position }) : target.click({ position }));
}

interface TapInput {
  position: Spot;
  isMobile: boolean;
}

/** dropX from the latest onDrop in the callback log. */
async function lastDropX(page: Page): Promise<number> {
  const text = await page.locator('#log li', { hasText: 'onDrop' }).last().textContent();
  return JSON.parse((text ?? '').replace(/^onDrop\s*/, '')).dropX;
}

// Tapping plays without a drag (WCAG 2.2 SC 2.5.7): tap a tray chip, then tap where to drop it.
test('a tap picks a chip up and a second tap drops it there', async ({ page, isMobile }) => {
  await mountBoard(page, { host: 'fixed' });
  const { trayChip, overBoard } = await spots(page);
  await tapOrClick(canvas(page), { position: trayChip(0), isMobile });
  await expect(board(page)).toHaveAttribute('data-state', 'holding');
  await tapOrClick(canvas(page), { position: overBoard(0.8), isMobile });
  await expect(page.locator('#log')).toContainText('onDrop');
  expect(await lastDropX(page)).toBeGreaterThan(0.6);
  await expect(board(page)).toHaveAttribute('data-state', 'idle');
  await expect.poll(() => countOf(page, 'on')).toBe(4);
});

test('a second tap on the tray puts the chip back', async ({ page, isMobile }) => {
  await mountBoard(page, { host: 'fixed' });
  const { trayChip } = await spots(page);
  await tapOrClick(canvas(page), { position: trayChip(0), isMobile });
  await expect(board(page)).toHaveAttribute('data-state', 'holding');
  await tapOrClick(canvas(page), { position: trayChip(1), isMobile });
  await expect(board(page)).toHaveAttribute('data-state', 'idle');
  await expect.poll(() => countOf(page, 'on')).toBe(5);
});

test.describe('mouse drag', () => {
  test.skip(({ isMobile }) => isMobile, 'Playwright can only tap by touch');

  test.beforeEach(async ({ page }) => {
    await mountBoard(page, { host: 'fixed' });
  });

  /** Presses on one spot, drags to another in steps, and lets go. */
  async function drag(page: Page, { from, to }: DragInput): Promise<void> {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
  }

  test('carries a chip from the tray into the drop zone and drops it', async ({ page }) => {
    const { trayChip, overBoard, onPage } = await spots(page);
    const from = onPage(trayChip(1));
    const to = onPage(overBoard(0.3));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await expect(board(page)).toHaveAttribute('data-state', 'holding');
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await expect(lastAnnouncement(page)).toHaveText(
      'Over the drop zone. Release or press Enter to drop.',
    );
    await page.mouse.up();
    await expect(page.locator('#log')).toContainText('onDrop');
    expect(await lastDropX(page)).toBeLessThan(0.4);
    // A pointer drop never reloads: the hand is empty again.
    await expect(board(page)).toHaveAttribute('data-state', 'idle');
  });

  test('let go below the drop zone, the chip falls off the board', async ({ page }) => {
    const { trayChip, onPage } = await spots(page);
    const box = await canvas(page).boundingBox();
    const middle = { x: (box?.width ?? 0) / 2, y: (box?.height ?? 0) / 2 };
    await drag(page, { from: onPage(trayChip(0)), to: onPage(middle) });
    await expect(lastAnnouncement(page)).toHaveText('The On chip fell off the board.');
    await expect.poll(() => countOf(page, 'on')).toBe(4);
    await expect(page.locator('#log')).not.toContainText('onDrop');
  });

  test('let go over the tray, the chip goes back', async ({ page }) => {
    const { trayChip, overBoard, onPage } = await spots(page);
    const from = onPage(trayChip(0));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    const up = onPage(overBoard(0.5));
    await page.mouse.move(up.x, up.y, { steps: 10 });
    await page.mouse.move(from.x, from.y, { steps: 10 });
    await page.mouse.up();
    await expect(board(page)).toHaveAttribute('data-state', 'idle');
    await expect.poll(() => countOf(page, 'on')).toBe(5);
  });
});

interface DragInput {
  from: Spot;
  to: Spot;
}

test.describe('touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone screens');

  test.beforeEach(async ({ page }) => {
    // A host without a height of its own: the board fills the width, but no taller than the screen.
    // The page is taller than the screen, so it can scroll.
    await mountBoard(page, { host: 'auto', css: 'body { padding-bottom: 150vh; }' });
  });

  test('the whole board fits on the screen', async ({ page }) => {
    const screen = page.viewportSize();
    await expect(async () => {
      const box = await canvas(page).boundingBox();
      expect(box?.height).toBeLessThanOrEqual(screen?.height ?? 0);
    }).toPass();
  });

  test('pressing a tray chip scrolls the whole board into view', async ({ page }) => {
    // Scroll so the top of the board is cut off but the tray still shows. Retried: the page only
    // gets tall enough once the board has refit to its new host.
    await expect(async () => {
      await page.evaluate(() => {
        const top = document.querySelector('#host canvas')?.getBoundingClientRect().top ?? 0;
        window.scrollBy(0, top + 120);
      });
      expect((await canvas(page).boundingBox())?.y).toBeLessThan(-100);
    }).toPass();
    const { trayChip } = await spots(page);
    await canvas(page).tap({ position: trayChip(0) });
    await expect(board(page)).toHaveAttribute('data-state', 'holding'); // a tap picks it up
    await expect(async () => {
      expect((await canvas(page).boundingBox())?.y).toBeGreaterThanOrEqual(-1);
    }).toPass();
  });
});
