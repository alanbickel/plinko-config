// Headless Plinko: drops chips one at a time and prints where they landed.
//   npm run sim -- --slots 7 --rows 8 --drops 10000 --x random --seed 1
//   --x is a drop position in [0, 1] or "random". --pile keeps landed chips (piles up).
import { parseArgs } from 'node:util';
import { buildLayout } from '../src/core/layout';
import { resolveCoreOptions } from '../src/core/options';
import { STEP, World } from '../src/core/world';

const { values: args } = parseArgs({
  options: {
    slots: { type: 'string', default: '7' },
    rows: { type: 'string', default: '8' },
    drops: { type: 'string', default: '10000' },
    x: { type: 'string', default: 'random' },
    seed: { type: 'string', default: '1' },
    pile: { type: 'boolean', default: false },
  },
});

const slotCount = Number(args.slots);
const drops = Number(args.drops);
const options = resolveCoreOptions({
  slots: Array.from({ length: slotCount }, (_, i) => ({ id: `s${i}`, label: `Slot ${i}` })),
  chips: [{ id: 'chip', label: 'Chip' }],
  board: { rows: Number(args.rows) },
  physics: { seed: Number(args.seed) },
});
const world = new World({
  layout: buildLayout(slotCount, options.board),
  physics: options.physics,
  keepLanded: args.pile,
});

const counts = new Array<number>(slotCount).fill(0);
const durations: number[] = [];
let pegHits = 0;
let nudged = 0;
let missed = 0;
let fullAt = '';
let xRng = 12345;
const started = performance.now();

for (let i = 0; i < drops; i++) {
  xRng = (Math.imul(xRng, 1103515245) + 12345) >>> 0;
  const x = args.x === 'random' ? xRng / 2 ** 32 : Number(args.x);
  const chip = world.spawn({ kindId: 'chip', x });
  while (world.flying.includes(chip)) world.step();
  if (chip.slotIndex === undefined) missed++;
  else counts[chip.slotIndex]++;
  if (world.full && !fullAt) fullAt = `${world.full} after ${i + 1} drops`;
  durations.push(chip.ageSteps * STEP);
  pegHits += chip.pegHits;
  if (chip.nudges > 0) nudged++;
}

const elapsed = performance.now() - started;
durations.sort((a, b) => a - b);
const pct = (p: number) => (durations[Math.floor((durations.length - 1) * p)] ?? 0).toFixed(2);
const max = Math.max(...counts);

console.log(
  `\n${drops} drops · ${slotCount} slots · ${args.rows} rows · x=${args.x} · seed=${args.seed}${args.pile ? ' · piling' : ''}\n`,
);
counts.forEach((n, i) => {
  const bar = '█'.repeat(Math.round((n / max) * 40));
  console.log(`  slot ${String(i).padStart(2)} ${String(n).padStart(6)}  ${bar}`);
});
console.log(
  `\n  fall time  p50 ${pct(0.5)}s · p95 ${pct(0.95)}s · max ${pct(1)}s (simulated)` +
    `\n  peg hits   ${(pegHits / drops).toFixed(1)} per drop` +
    `\n  missed     ${missed} chips (${((missed / drops) * 100).toFixed(2)}%)` +
    `\n  board full ${fullAt || 'no'}` +
    `\n  nudged     ${nudged} chips (${((nudged / drops) * 100).toFixed(2)}%)` +
    `\n  wall clock ${(elapsed / 1000).toFixed(2)}s (${((elapsed * 1000) / durations.reduce((a, b) => a + b / STEP, 0)).toFixed(1)} µs per chip-step)\n`,
);
