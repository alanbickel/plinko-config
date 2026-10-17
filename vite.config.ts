import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `vite` serves the demo page; `vite build` builds the library.
export default defineConfig(({ command }) => ({
  root: command === 'serve' ? 'demo' : undefined,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: {
        index: 'src/index.ts',
        element: 'src/element.ts',
      },
      formats: ['es'],
    },
  },
  test: {
    root: '.',
    setupFiles: './src/setupTests.ts',
    // Unit tests only; e2e/ holds the Playwright suite (npm run test:e2e).
    projects: [
      {
        extends: true,
        test: { name: 'library', include: ['src/**/*.test.ts'], environment: 'node' },
      },
      {
        // The docs playground's logic. It imports the package by name, so point that at src/:
        // the tests run before `npm run check` builds dist/.
        extends: true,
        resolve: {
          alias: { 'plinko-config': fileURLToPath(new URL('src/index.ts', import.meta.url)) },
        },
        test: {
          name: 'playground',
          include: ['site/.vitepress/theme/playground/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
    ],
  },
}));
