// Proves the text sizing tests can fail: each patch breaks one rule in src/, and the named tests must
// then fail. Files are restored afterwards, whatever happens; dist/ is rebuilt from the restored
// source. Edits the working tree while it runs, so don't run it alongside other edits.
// Usage: tsx scripts/sabotage.ts [patch names...]   (all patches when none are named)

import { execSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LABELS = 'src/runtime/view/slot-labels.ts';
const LABEL_TESTS = 'src/runtime/view/slot-labels.test.ts';
const SIZING = 'src/runtime/sizing.ts';
const SIZING_TESTS = 'src/runtime/sizing.test.ts';
const GEOMETRY = 'src/runtime/view/geometry.ts';
const GEOMETRY_TESTS = 'src/runtime/view/geometry.test.ts';
const OBSERVE = 'src/runtime/observe.ts';
const E2E = 'e2e/text-size.spec.ts';

/** One find-and-replace; `find` must occur exactly once. */
interface Edit {
  file: string;
  find: string;
  replace: string;
}

/** Tests that must fail, by file and a part of their title. */
interface Expect {
  file: string;
  titles: string[];
}

interface Patch {
  name: string;
  /** The bug it plants, in a few words. */
  bug: string;
  edits: Edit[];
  unit?: Expect;
  e2e?: Expect;
}

const PATCHES: Patch[] = [
  {
    name: 'no-floor',
    bug: 'text may shrink to nothing',
    edits: [{ file: LABELS, find: 'minSize: floor / unit,', replace: 'minSize: 0,' }],
    unit: { file: LABEL_TESTS, titles: ['never draws a label under 0.75rem'] },
  },
  {
    name: 'board-unit-sizes',
    bug: 'text sized from the board, with a fixed 12px floor (the old sizing)',
    edits: [
      {
        file: LABELS,
        find: 'normal: LABEL_REM * remPx,\n  floor: MIN_TEXT_REM * remPx,',
        replace: 'normal: (0.26 * cssWidth) / (layout.width + 2 * SIDE),\n  floor: 12,',
      },
    ],
    unit: {
      file: LABEL_TESTS,
      titles: ['plans text at 0.875rem', 'never draws a label under 0.75rem', 'doubles the label'],
    },
    e2e: { file: E2E, titles: ['a 32px root font size doubles the label size'] },
  },
  {
    name: 'plan-draw-mismatch',
    bug: 'drawing raises text above the planned size (the "Dark M…" bug)',
    edits: [{ file: LABELS, find: 'minSize: plan.minSize,', replace: 'minSize: plan.size * 1.3,' }],
    unit: { file: LABEL_TESTS, titles: ['draws every label at the planned size or smaller'] },
  },
  {
    name: 'ignore-extra-right-plan',
    bug: 'angled labels get no room past the right wall',
    edits: [
      {
        file: LABELS,
        find: 'const extraRight = roomy ? 0 : overhang - credit * u;',
        replace: 'const extraRight = 0;',
      },
    ],
    unit: {
      file: LABEL_TESTS,
      titles: ['fills the canvas width exactly', 'the room past the wall holds the last label'],
    },
  },
  {
    name: 'ignore-extra-right-view',
    bug: 'the drawn area ignores the room planned past the wall',
    edits: [
      {
        file: GEOMETRY,
        find: 'const side = SIDE + strip.extraRight;',
        replace: 'const side = SIDE;',
      },
    ],
    e2e: { file: E2E, titles: ['slot label sizing matrix'] },
  },
  {
    name: 'ignore-apart',
    bug: 'neighbouring labels may touch',
    edits: [
      {
        file: LABELS,
        find: '(apart(plan) || (hopeless && plan.size <= px.floor));',
        replace: '(true || apart(plan) || hopeless);',
      },
    ],
    unit: { file: LABEL_TESTS, titles: ['keeps neighbouring labels a line apart'] },
    e2e: { file: E2E, titles: ['slot label sizing matrix'] },
  },
  {
    name: 'no-strip-cap',
    bug: 'vertical and angled strips grow without limit',
    edits: [
      {
        file: LABELS,
        find: 'STRIP_SHARE * (px.layout.floorY - px.layout.spawnY) * plan.unit;',
        replace: 'Infinity * plan.unit;',
      },
    ],
    unit: { file: LABEL_TESTS, titles: ['the strip never grows past its share of the board'] },
  },
  {
    name: 'fit-by-aspect',
    bug: 'the fit assumes height is proportional to width (the old fit)',
    edits: [
      {
        file: SIZING,
        find: 'if (heightAt(available) <= roomHeight) return available;',
        replace: 'return Math.min(available, (roomHeight * available) / heightAt(available));',
      },
    ],
    unit: { file: SIZING_TESTS, titles: ['narrows to the widest canvas whose height fits'] },
  },
  {
    name: 'no-rounding-slack',
    bug: 'text sized to fit exactly is cut by a rounding error',
    edits: [{ file: LABELS, find: 'const ROUNDING = 1 + 1e-9;', replace: 'const ROUNDING = 1;' }],
    unit: { file: LABEL_TESTS, titles: ['shrinks text to fit, but never below the minimum'] },
  },
  {
    name: 'tray-board-units',
    bug: 'tray captions sized from the board, not rem (the old sizing)',
    edits: [
      {
        file: GEOMETRY,
        find: 'const captionSize = (LABEL_REM * remPx) / unit;',
        replace: 'const captionSize = 0.26;',
      },
    ],
    unit: { file: GEOMETRY_TESTS, titles: ['sizes captions at 0.875rem and notes at 0.75rem'] },
    e2e: { file: E2E, titles: ['tray captions and notes double with a 32px root font size'] },
  },
  {
    name: 'fixed-tray-height',
    bug: "the tray keeps its height whatever its text's size",
    edits: [
      {
        file: GEOMETRY,
        find: 'const height = noteY + (LINE * noteSize) / 2 + TRAY_PAD;',
        replace: 'const height = 1.95;',
      },
    ],
    unit: {
      file: GEOMETRY_TESTS,
      titles: ['stacks chips, caption and note without overlap', 'grows with the root font size'],
    },
    e2e: {
      file: E2E,
      titles: ['1280x800, root font size 32px: tray text stays inside the canvas'],
    },
  },
  {
    name: 'banner-board-units',
    bug: 'the banner sized from the board, not rem (the old sizing)',
    edits: [
      {
        file: GEOMETRY,
        find: 'const size = (BANNER_REM * remPx) / unit;',
        replace: 'const size = 0.34;',
      },
    ],
    unit: { file: GEOMETRY_TESTS, titles: ['sizes the banner at 1.125rem'] },
    e2e: { file: E2E, titles: ['the full-board banner doubles with a 32px root font size'] },
  },
  {
    name: 'no-rem-ruler',
    bug: 'a root font size change alone goes unnoticed until something resizes',
    edits: [{ file: OBSERVE, find: 'observer.observe(ctx.dom.remRuler);', replace: '' }],
    e2e: { file: E2E, titles: ['a root font size change alone refits the board'] },
  },
];

function apply(edit: Edit): void {
  const text = readFileSync(edit.file, 'utf8');
  const count = text.split(edit.find).length - 1;
  if (count !== 1) throw new Error(`${edit.file}: expected one "${edit.find}", found ${count}.`);
  writeFileSync(edit.file, text.replace(edit.find, edit.replace));
}

const run = (command: string) => {
  try {
    execSync(command, { stdio: 'pipe' });
  } catch {
    // Failing tests exit non-zero; the report says which.
  }
};

interface VitestFile {
  assertionResults: VitestAssertion[];
}

interface VitestAssertion {
  fullName: string;
  status: string;
}

interface VitestReport {
  testResults: VitestFile[];
}

/** Titles of the failed tests in one unit test file. */
function unitFailures(file: string): string[] {
  const out = join(tmpdir(), 'sabotage-vitest.json');
  run(`npx vitest run ${file} --reporter=json --outputFile=${out}`);
  const report = JSON.parse(readFileSync(out, 'utf8')) as VitestReport;
  rmSync(out);
  return report.testResults
    .flatMap((r) => r.assertionResults)
    .filter((a) => a.status === 'failed')
    .map((a) => a.fullName);
}

interface PlaywrightSpec {
  title: string;
  ok: boolean;
}

interface PlaywrightReport {
  suites: PlaywrightSuite[];
}

interface PlaywrightSuite {
  title: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

const failedSpecs = (suite: PlaywrightSuite, path = ''): string[] => [
  ...(suite.specs ?? []).filter((s) => !s.ok).map((s) => `${path}${suite.title} › ${s.title}`),
  ...(suite.suites ?? []).flatMap((s) => failedSpecs(s, `${path}${suite.title} › `)),
];

/** Titles of the failed e2e tests in one spec, against a fresh build. */
function e2eFailures(file: string): string[] {
  const out = join(tmpdir(), 'sabotage-playwright.json');
  run('npm run build');
  run(`npx playwright test ${file} --project=desktop --reporter=json > "${out}"`);
  const report = JSON.parse(readFileSync(out, 'utf8')) as PlaywrightReport;
  rmSync(out);
  return report.suites.flatMap((s) => failedSpecs(s));
}

/** Expected titles that didn't fail. */
const missed = (expected: Expect | undefined, failed: string[]): string[] =>
  (expected?.titles ?? []).filter((t) => !failed.some((f) => f.includes(t)));

/** Plants the patch, runs its tests, and restores the files. True if every expected test failed. */
function check(patch: Patch): boolean {
  const originals = new Map(patch.edits.map((e) => [e.file, readFileSync(e.file, 'utf8')]));
  try {
    for (const edit of patch.edits) apply(edit);
    const unit = patch.unit ? missed(patch.unit, unitFailures(patch.unit.file)) : [];
    const e2e = patch.e2e ? missed(patch.e2e, e2eFailures(patch.e2e.file)) : [];
    const survived = [...unit, ...e2e];
    const verdict = survived.length === 0 ? 'caught' : `NOT CAUGHT by: ${survived.join('; ')}`;
    console.log(`${patch.name} (${patch.bug}): ${verdict}`);
    return survived.length === 0;
  } finally {
    for (const [file, text] of originals) writeFileSync(file, text);
  }
}

const names = process.argv.slice(2);
const chosen = names.length ? PATCHES.filter((p) => names.includes(p.name)) : PATCHES;
const unknown = names.filter((n) => !PATCHES.some((p) => p.name === n));
if (unknown.length)
  throw new Error(`Unknown patches: ${unknown}. Known: ${PATCHES.map((p) => p.name)}`);
const results = chosen.map(check);
if (chosen.some((p) => p.e2e)) run('npm run build');
const caught = results.filter(Boolean).length;
console.log(`\n${caught} of ${chosen.length} patches caught.`);
process.exitCode = caught === chosen.length ? 0 : 1;
