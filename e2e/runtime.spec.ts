import type { Page } from '@playwright/test';
import { countOf, expect, mountBoard, test } from './fixtures';

// The board from createPlinko (dist/), in a host with its own height unless a test says otherwise.

const board = (page: Page) => page.locator('#host .plinko-config');
const canvas = (page: Page) => page.locator('#host canvas');
const lastAnnouncement = (page: Page) => page.locator('#transcript li').last();
/** Carries the held chip up into the drop zone, by keyboard. */
async function carryUp(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowUp');
}
const focusIsCanvas = (page: Page) =>
  page.evaluate(() => document.activeElement?.tagName === 'CANVAS');

test('draws the board', async ({ page }) => {
  await mountBoard(page, { host: 'fixed' });
  // A blank or failed canvas has one colour; the board has background, pegs, walls, chips, text.
  const colours = await canvas(page).evaluate((el: HTMLCanvasElement) => {
    const { data } = el.getContext('2d')?.getImageData(0, 0, el.width, el.height) ?? { data: [] };
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 97) {
      seen.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
    }
    return seen.size;
  });
  expect(colours).toBeGreaterThan(5);
});

test('fits inside a host that has its own height, and refits on resize', async ({ page }) => {
  await mountBoard(page, { host: 'fixed' });
  const fits = async () => {
    const host = await page.locator('#host').boundingBox();
    const box = await canvas(page).boundingBox();
    if (!host || !box) throw new Error('not laid out');
    expect(box.width).toBeLessThanOrEqual(host.width + 1);
    expect(box.height).toBeLessThanOrEqual(host.height + 1);
    // Whole board visible, centred horizontally in the host.
    expect(Math.abs(box.x + box.width / 2 - (host.x + host.width / 2))).toBeLessThan(2);
    return box;
  };
  const before = await fits();
  await page.setViewportSize({ width: 1280, height: 520 });
  await expect(async () => {
    const after = await fits();
    expect(after.height).toBeLessThan(before.height);
  }).toPass();
});

test.describe('keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard play is checked on desktop');

  test('plays entirely by keyboard, with announcements', async ({ page }) => {
    await mountBoard(page, { host: 'fixed' });
    await page.keyboard.press('Tab');
    expect(await focusIsCanvas(page)).toBe(true);

    await page.keyboard.press('ArrowRight');
    await expect(lastAnnouncement(page)).toHaveText('Off chip, 5 left.');

    await page.keyboard.press('Enter');
    await expect(board(page)).toHaveAttribute('data-state', 'holding');
    await expect(board(page)).toHaveAttribute('data-zone', 'board');
    await expect(lastAnnouncement(page)).toContainText('Picked up an Off chip');

    await carryUp(page);
    await expect(lastAnnouncement(page)).toHaveText(
      'Over the drop zone. Release or press Enter to drop.',
    );
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(page.locator('#log')).toContainText('onDrop');
    await expect(page.locator('#log')).toContainText(/onLand|onMiss/, { timeout: 10_000 });
    await expect(lastAnnouncement(page)).toContainText(/landed in|didn't make it/);

    await page.keyboard.press('Escape');
    await expect(board(page)).toHaveAttribute('data-state', 'idle');
    await expect(board(page)).toHaveAttribute('data-zone', 'tray');
  });

  test('Enter below the drop zone loses the chip off the board', async ({ page }) => {
    await mountBoard(page, { host: 'fixed' });
    await canvas(page).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(lastAnnouncement(page)).toHaveText('The On chip fell off the board.');
    await expect.poll(() => countOf(page, 'on')).toBe(4);
    await expect(page.locator('#log')).not.toContainText('onDrop');
  });

  test('Tab always leaves the board, even while holding a chip', async ({ page }) => {
    await mountBoard(page, { host: 'fixed' });
    await canvas(page).focus();
    await page.keyboard.press('Enter');
    await expect(board(page)).toHaveAttribute('data-state', 'holding');
    await page.keyboard.press('Tab');
    expect(await focusIsCanvas(page)).toBe(false);
  });

  test('runs out of chips and requests more, by keyboard', async ({ page }) => {
    // One On chip, refill on request, no onRequest callback: requests are granted.
    const chips = [
      { id: 'on', label: 'On', count: 1 },
      { id: 'off', label: 'Off', count: 5 },
    ];
    await mountBoard(page, { host: 'fixed', options: { chips } });
    await canvas(page).focus();
    await page.keyboard.press('Enter'); // pick up the only On chip
    await carryUp(page);
    await page.keyboard.press('Enter'); // drop it
    await expect(lastAnnouncement(page)).toHaveText(
      'Out of On chips. Press Enter to request more.',
    );
    await page.keyboard.press('Enter'); // request
    await expect(lastAnnouncement(page)).toHaveText('Request granted: more On chips.');
    await expect.poll(() => countOf(page, 'on')).toBe(1);
  });
});

test('destroy() leaves nothing behind', async ({ page }) => {
  await mountBoard(page, { host: 'fixed' });
  await page.evaluate(() => window.harness.destroy());
  await expect(page.locator('#host')).toBeEmpty();
});

test('with reduced motion, a dropped chip settles at once instead of falling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mountBoard(page, { host: 'fixed' });
  await page.evaluate(() => {
    window.harness
      .board()
      ?.drop()
      .catch(() => {});
  });
  // A fall takes seconds; settling at once lands within a frame or two.
  await expect(page.locator('#log')).toContainText(/onLand|onMiss/, { timeout: 500 });
});

test('the attribution link sits under the board, even in a host wider than the board', async ({
  page,
}) => {
  // A short, wide host: the board fits its height and leaves width over, on phones too.
  await mountBoard(page, { host: 'fixed', css: '#host.fixed { height: 50vh; }' });
  const canvasBox = await canvas(page).boundingBox();
  const host = await page.locator('#host').boundingBox();
  const link = await page.locator('#host [part="attribution"]').boundingBox();
  if (!canvasBox || !host || !link) throw new Error('not laid out');
  expect(canvasBox.width).toBeLessThan(host.width - 20); // the board is narrower than its host here
  expect(Math.abs(link.x + link.width - (canvasBox.x + canvasBox.width))).toBeLessThan(1);
});
