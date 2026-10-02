import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// axe-core scans of the board itself (not the debug page around it), against WCAG 2.2 A and AA,
// in the states a visitor can reach. The board is canvas plus a little DOM, so axe checks the DOM
// half: roles, names, descriptions, the live region, focusability, and the attribution link.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page, selector: string) {
  const results = await new AxeBuilder({ page }).include(selector).withTags(WCAG).analyze();
  // Rule ids and the offending nodes, so a failure says what's wrong without opening a report.
  return results.violations.map((v) => ({ rule: v.id, nodes: v.nodes.map((n) => n.target) }));
}

test.describe('the board (createPlinko)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/runtime.html');
    await expect(page.locator('#host canvas')).toBeVisible();
  });

  test('has no violations when idle', async ({ page }) => {
    expect(await violations(page, '#host')).toEqual([]);
  });

  test('has no violations while holding a chip', async ({ page }) => {
    await page.getByRole('button', { name: 'pickUp(selected)' }).click();
    await expect(page.locator('#host .plinko-config')).toHaveAttribute('data-state', 'holding');
    expect(await violations(page, '#host')).toEqual([]);
  });

  test('has no violations once locked', async ({ page }) => {
    await page.locator('#refill').selectOption('never');
    await page.locator('#countOn').fill('0');
    await page.locator('#countOff').fill('0');
    await page.locator('#countOff').blur(); // remounts with no chips at all: locked at once
    await expect(page.locator('#host .plinko-config')).toHaveAttribute('data-state', 'locked');
    expect(await violations(page, '#host')).toEqual([]);
  });
});

test('<plinko-board> has no violations, shadow DOM included', async ({ page }) => {
  await page.goto('/fixtures/element.html');
  await expect(page.locator('plinko-board canvas')).toBeVisible();
  expect(await violations(page, 'plinko-board')).toEqual([]);
});
