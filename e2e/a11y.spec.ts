import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { ELEMENT_FIXTURE, expect, mountBoard, mountElement, test } from './fixtures';

// axe-core scans of the board itself, against WCAG 2.2 A and AA, in the states a visitor can
// reach. The board is canvas plus a little DOM, so axe checks the DOM half: roles, names,
// descriptions, the live region, focusability, and the attribution link.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page, selector: string) {
  const results = await new AxeBuilder({ page }).include(selector).withTags(WCAG).analyze();
  // Rule ids and the offending nodes, so a failure says what's wrong without opening a report.
  return results.violations.map((v) => ({ rule: v.id, nodes: v.nodes.map((n) => n.target) }));
}

test.describe('the board (createPlinko)', () => {
  test('has no violations when idle', async ({ page }) => {
    await mountBoard(page, { host: 'fixed' });
    expect(await violations(page, '#host')).toEqual([]);
  });

  test('has no violations while holding a chip', async ({ page }) => {
    await mountBoard(page, { host: 'fixed' });
    await page.evaluate(() => window.harness.board()?.pickUp('on'));
    await expect(page.locator('#host .plinko-config')).toHaveAttribute('data-state', 'holding');
    expect(await violations(page, '#host')).toEqual([]);
  });

  test('has no violations once locked', async ({ page }) => {
    // No chips at all and no refill: locked at once.
    const chips = [
      { id: 'on', label: 'On', count: 0 },
      { id: 'off', label: 'Off', count: 0 },
    ];
    await mountBoard(page, {
      host: 'fixed',
      options: { chips, supply: { refill: { mode: 'never' } } },
    });
    await expect(page.locator('#host .plinko-config')).toHaveAttribute('data-state', 'locked');
    expect(await violations(page, '#host')).toEqual([]);
  });
});

test('<plinko-board> has no violations, shadow DOM included', async ({ page }) => {
  await mountElement(page, ELEMENT_FIXTURE);
  expect(await violations(page, 'plinko-board')).toEqual([]);
});
