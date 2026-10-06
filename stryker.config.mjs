// Mutation testing (npm run mutate): on demand, not in check or CI. Scoped to the code that sizes
// the board and its text; widen `mutate` when another area needs the same scrutiny.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  mutate: [
    'src/runtime/view/slot-labels.ts',
    'src/runtime/view/geometry.ts',
    'src/runtime/sizing.ts',
  ],
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  tempDirName: '.stryker-tmp',
  // Stryker rewrites tsconfig paths through the TypeScript JS API, which TypeScript 7 doesn't
  // have. Our tsconfig has no extends or references to rewrite, so point it at nothing to skip.
  tsconfigFile: 'no-tsconfig-for-stryker.json',
};
