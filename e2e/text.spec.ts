import { expect, test } from './fixtures';

// Canvas text can silently draw nothing (Firefox once did: it skips fonts under 1px), and the
// board still looks drawn. Paint all text magenta through the theme and look for it.

test('draws slot labels and tray captions', async ({ page }) => {
  await page.route('**/runtime.html', async (route) => {
    const response = await route.fetch();
    const magenta = ':root { --plinko-text: #ff00ff; --plinko-muted-text: #ff00ff; }';
    const body = (await response.text()).replace('</head>', `<style>${magenta}</style></head>`);
    await route.fulfill({ response, body });
  });
  await page.goto('/runtime.html');
  const canvas = page.locator('#host canvas');
  await expect(canvas).toBeVisible();
  await expect(async () => {
    const magenta = await canvas.evaluate((el: HTMLCanvasElement) => {
      const image = el.getContext('2d')?.getImageData(0, 0, el.width, el.height);
      // One RGBA pixel per entry; the red byte is lowest (little-endian).
      const pixels = new Uint32Array(image?.data.buffer ?? new ArrayBuffer(0));
      const byte = (v: number, shift: number) => (v >>> shift) & 0xff;
      const isMagenta = (v: number) => byte(v, 0) > 200 && byte(v, 8) < 80 && byte(v, 16) > 200;
      return pixels.filter(isMagenta).length;
    });
    // Five labels and two captions; a few glyph pixels each at the very least.
    expect(magenta).toBeGreaterThan(200);
  }).toPass();
});
