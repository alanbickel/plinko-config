import { test as base, expect, type Page } from '@playwright/test';
import type { ElementSpec, MountSpec } from './harness/harness';

/** Every spec fails if the page reports an uncaught error, even one that breaks nothing visible. */
export const test = base.extend<{ noPageErrors: undefined }>({
  noPageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(undefined);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Opens the harness and waits until it has loaded dist/. */
async function openHarness(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.harness !== undefined);
}

/** Mounts a board with createPlinko (see MountSpec for the defaults) and waits for it to draw. */
export async function mountBoard(page: Page, spec: MountSpec = {}): Promise<void> {
  await openHarness(page);
  await page.evaluate((s) => window.harness.mount(s), spec);
  await expect(page.locator('#host canvas')).toBeVisible();
}

/** Mounts a <plinko-board> in place of the host and waits for it to draw. */
export async function mountElement(page: Page, spec: ElementSpec): Promise<void> {
  await openHarness(page);
  await page.evaluate((s) => window.harness.mountElement(s), spec);
  await expect(page.locator('plinko-board canvas')).toBeVisible();
}

/** A chip kind's count, from board.supply. */
export const countOf = (page: Page, chip: string) =>
  page.evaluate((id) => window.harness.board()?.supply.get().counts[id], chip);

/** The <plinko-board> most specs use: three slots, one chip kind, 360px wide. */
export const ELEMENT_FIXTURE: ElementSpec = {
  style: 'width: 360px',
  options: {
    slots: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ],
    chips: [{ id: 'on', label: 'On' }],
    physics: { seed: 1 },
  },
};
