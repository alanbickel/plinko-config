// Type-checks the playground's "Export config" output: renders exportConfig() for a set of
// configurations, writes each to a temporary .ts file, and compiles them with the root tsconfig
// against the public API. Run by `npm run docs:examples`.
// Usage: tsx scripts/playground-export.ts

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  initialConfig,
  type PlaygroundConfig,
  type RefillMode,
} from '../site/.vitepress/theme/playground/config';
import { exportConfig } from '../site/.vitepress/theme/playground/export';
import {
  ANNOUNCED,
  BOARD_TEXT,
  type LabelDrafts,
} from '../site/.vitepress/theme/playground/labels';

/** Text that's awkward to quote: both quote kinds, a backslash, a backtick and `${`. */
const AWKWARD = `It's "odd" \\ \`tick\` \${x}`;

/** Every label set to `text`. */
function everyLabel(text: string): LabelDrafts {
  const specs = [...ANNOUNCED, ...BOARD_TEXT];
  return Object.fromEntries(specs.map(({ key }) => [key, text]));
}

/** Every option changed from the playground's defaults. */
function everything(): PlaygroundConfig {
  const config = initialConfig('light');
  return {
    ...config,
    slots: [
      { id: 'plain', label: AWKWARD, fill: '#ff0000' },
      { id: 'needs quotes', label: 'Spaced id', fill: '' },
      { id: '1st', label: 'Digit first', fill: 'rgb(0, 0, 255)' },
    ],
    chips: [
      { id: 'limited', label: 'Limited', count: 3, fill: '#00ff00' },
      { id: 'un-limited', label: 'Unlimited', count: null, fill: '' },
    ],
    physics: Object.fromEntries(
      Object.entries(config.physics).map(([key, value]) => [
        key,
        typeof value === 'number' ? value / 2 : !value,
      ]),
    ) as PlaygroundConfig['physics'],
    seed: 42,
    board: { ...config.board, rows: config.board.rows + 1, railWidth: 0.25 },
    slotLabels: { ...config.slotLabels, layout: 'vertical' },
    controls: {
      autoReload: false,
      maxInFlight: 2,
      motion: 'reduced',
      aimStep: 0.1,
      aimStepLarge: 0.5,
      liftStep: 0.1,
      liftStepLarge: 0.5,
    },
    // Every token, including ones the label doesn't offer.
    labels: everyLabel(`${AWKWARD} {chip} {slot} {count} {other}`),
  };
}

/** Labels that offer tokens but use none export as `() => '…'`, not a template literal. */
function labelsWithoutTokens(): PlaygroundConfig {
  return { ...initialConfig('dark'), labels: everyLabel(AWKWARD) };
}

function withRefill(refill: RefillMode): PlaygroundConfig {
  const config = initialConfig('dark');
  return { ...config, supply: { ...config.supply, refill } };
}

const CASES: Record<string, PlaygroundConfig> = {
  'defaults-dark': initialConfig('dark'),
  'defaults-light': initialConfig('light'),
  'refill-never': withRefill('never'),
  'refill-interval': withRefill('interval'),
  everything: everything(),
  'labels-without-tokens': labelsWithoutTokens(),
};

const root = resolve(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'plinko-export-'));
try {
  for (const [name, config] of Object.entries(CASES)) {
    // As .ts and as .js: the export is plain JavaScript that also type-checks in TypeScript.
    const source = `${exportConfig(config)}\nexport {};\n`;
    writeFileSync(join(dir, `${name}.ts`), source);
    writeFileSync(join(dir, `${name}-js.js`), source);
  }
  const tsconfig = {
    extends: join(root, 'tsconfig.json'),
    compilerOptions: {
      types: [],
      allowJs: true,
      checkJs: true,
      paths: { 'plinko-config': [join(root, 'src/index.ts')] },
    },
    include: ['*.ts', '*.js'],
  };
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(tsconfig));
  try {
    execSync(`npx tsc -p "${dir}"`, { cwd: root, stdio: 'pipe' });
  } catch (error) {
    const output = (error as { stdout?: Buffer }).stdout?.toString() ?? String(error);
    console.error(`Export config output doesn't type-check:\n${output}`);
    for (const name of Object.keys(CASES)) {
      if (output.includes(`${name}.ts`) || output.includes(`${name}-js.js`)) {
        console.error(`--- ${name} ---\n${exportConfig(CASES[name] as PlaygroundConfig)}\n`);
      }
    }
    process.exitCode = 1;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
if (!process.exitCode) {
  console.log(`Export config output type-checks for ${Object.keys(CASES).length} configurations.`);
}
