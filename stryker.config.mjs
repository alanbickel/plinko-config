// Mutation testing (npm run mutate). Parked: with Stryker 10 and Vitest 5 its scores aren't
// meaningful yet; see CONTRIBUTING.md, "Mutation testing". Kept for future investigation.
// Scoped to the code that sizes the board and its text; widen `mutate` when another area needs it.

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
  // A fresh Vitest worker takes ~5 s to start; the default margin (5 s) times out healthy runs and
  // counts them as detected. 30 s still catches real infinite loops.
  timeoutMS: 30000,
  // Stryker rewrites tsconfig paths through the TypeScript JS API, which TypeScript 7 doesn't
  // have. Our tsconfig has no extends or references to rewrite, so point it at nothing to skip.
  tsconfigFile: 'no-tsconfig-for-stryker.json',
};
