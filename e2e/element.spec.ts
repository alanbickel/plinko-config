import { expect, test } from './fixtures';

// Runs against demo/fixtures/element.html: <plinko-board> set up through its options property.

test.beforeEach(async ({ page }) => {
  await page.goto('/fixtures/element.html');
});

test('renders the board inside its shadow root, within the element and the screen', async ({
  page,
}) => {
  await expect(page.locator('plinko-board canvas')).toBeVisible();
  const box = await page.locator('plinko-board canvas').boundingBox();
  expect(box?.width).toBeLessThanOrEqual(360);
  expect(box?.height).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
});

test.describe('keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard play is checked on desktop');

  test('plays by keyboard and fires plinko-* events that cross the shadow boundary', async ({
    page,
  }) => {
    await page.locator('plinko-board canvas').focus();
    await page.keyboard.press('Enter');
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Enter');
    const events = page.locator('#events');
    await expect(events).toContainText('plinko-pick-up');
    await expect(events).toContainText('plinko-drop');
    await expect(events).toContainText(/plinko-land|plinko-miss/, { timeout: 10_000 });
  });
});

test('updates in place for live options, and remounts only when slots change', async ({ page }) => {
  const sameBoardAfter = (change: 'labels' | 'slots') =>
    page.evaluate((what) => {
      const el = document.querySelector('plinko-board');
      if (!el?.options) throw new Error('no options');
      const before = el.board;
      const next =
        what === 'labels'
          ? { labels: { board: 'Renamed' } }
          : { slots: [{ id: 'z', label: 'Zeta' }] };
      el.options = { ...el.options, ...next };
      return el.board === before;
    }, change);
  expect(await sameBoardAfter('labels')).toBe(true);
  await expect(page.locator('plinko-board canvas')).toHaveAttribute('aria-label', 'Renamed');
  expect(await sameBoardAfter('slots')).toBe(false);
  await expect(page.locator('plinko-board canvas')).toHaveCount(1);
});
