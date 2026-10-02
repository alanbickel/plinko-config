import { test as base, expect } from '@playwright/test';

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
