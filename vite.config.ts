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
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
