// Physics debug page: tune the core simulation by eye. Not part of the package.
import { buildLayout, type Circle, dropXToBoard, type Layout } from '../src/core/layout';
import { DEFAULT_BOARD, DEFAULT_PHYSICS, resolveCoreOptions } from '../src/core/options';
import type { ResolvedBoard, ResolvedPhysics } from '../src/core/types';
import { STEP, World, type WorldEventByType } from '../src/core/world';
import { dispatchByType, type HandlerMap } from '../src/runtime/dispatch';

const COLORS = {
  bg: '#11151c',
  wall: '#3b4553',
  peg: '#9aa4b2',
  pegHit: '#ffd166',
  rail: '#5c6b7e',
  flying: '#ffb347',
  landed: '#3ec7a8',
  missed: '#e0607e',
  guide: '#2c3440',
  bar: '#3d6fd9',
  text: '#e6e9ee',
};
const HIST_HEIGHT = 2.5; // board units under the floor for the histogram
const PEG_FLASH_MS = 120;
const MAX_STEPS_PER_FRAME = 40;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('board');
const g = canvas.getContext('2d') as CanvasRenderingContext2D;

// ---- Settings -------------------------------------------------------------

const physics: ResolvedPhysics = { ...DEFAULT_PHYSICS, seed: 1, bias: [] };
const board: ResolvedBoard = { ...DEFAULT_BOARD };
const sim = { slots: 7, piles: true, speed: 1, seed: 1 };

interface SliderSpec {
  label: string;
  min: number;
  max: number;
  step: number;
}

interface Slider<K extends string> extends SliderSpec {
  key: K;
}

interface SliderInput {
  parent: HTMLElement;
  spec: SliderSpec;
  value: number;
  onInput: (value: number) => void;
}

interface CheckInput {
  parent: HTMLElement;
  text: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const physicsSliders: Slider<'gravity' | 'restitution' | 'friction' | 'jitter' | 'maxSpeed'>[] = [
  { key: 'gravity', label: 'Gravity', min: 5, max: 120, step: 1 },
  { key: 'restitution', label: 'Bounce', min: 0, max: 1, step: 0.01 },
  { key: 'friction', label: 'Friction', min: 0, max: 1, step: 0.01 },
  { key: 'jitter', label: 'Jitter', min: 0, max: 3, step: 0.05 },
  { key: 'maxSpeed', label: 'Max speed', min: 2, max: 30, step: 0.5 },
];
const boardSliders: Slider<'rows' | 'chipRadius' | 'pegRadius' | 'slotHeight'>[] = [
  { key: 'rows', label: 'Rows', min: 1, max: 20, step: 1 },
  { key: 'chipRadius', label: 'Chip radius', min: 0.1, max: 0.45, step: 0.01 },
  { key: 'pegRadius', label: 'Peg radius', min: 0.02, max: 0.2, step: 0.01 },
  { key: 'slotHeight', label: 'Slot height', min: 0.8, max: 5, step: 0.1 },
];

function addSlider({ parent, spec, value, onInput }: SliderInput): void {
  const label = document.createElement('label');
  const input = Object.assign(document.createElement('input'), {
    type: 'range',
    min: String(spec.min),
    max: String(spec.max),
    step: String(spec.step),
    value: String(value),
  });
  const out = document.createElement('output');
  out.value = String(value);
  input.addEventListener('input', () => {
    out.value = input.value;
    onInput(Number(input.value));
  });
  label.append(spec.label, input, out);
  parent.append(label);
}

function addCheck({ parent, text, checked, onChange }: CheckInput): void {
  const label = Object.assign(document.createElement('label'), { className: 'check' });
  const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  label.append(input, text);
  parent.append(label);
}

for (const spec of physicsSliders) {
  // Live: the world reads this same object every step.
  addSlider({
    parent: $('physics'),
    spec,
    value: physics[spec.key],
    onInput: (v) => {
      physics[spec.key] = v;
    },
  });
}
addCheck({
  parent: $('physics'),
  text: 'Chip–chip collisions',
  checked: physics.chipCollisions,
  onChange: (v) => {
    physics.chipCollisions = v;
  },
});

const resetting =
  <T>(apply: (value: T) => void) =>
  (value: T) => {
    apply(value);
    reset();
  };

addSlider({
  parent: $('geometry'),
  spec: { label: 'Slots', min: 1, max: 15, step: 1 },
  value: sim.slots,
  onInput: resetting((v) => {
    sim.slots = v;
  }),
});
for (const spec of boardSliders) {
  addSlider({
    parent: $('geometry'),
    spec,
    value: board[spec.key],
    onInput: resetting((v) => {
      board[spec.key] = v;
    }),
  });
}
addSlider({
  parent: $('sim'),
  spec: { label: 'Speed', min: 0.05, max: 2, step: 0.05 },
  value: sim.speed,
  onInput: (v) => {
    sim.speed = v;
  },
});
addSlider({
  parent: $('sim'),
  spec: { label: 'Seed', min: 1, max: 100, step: 1 },
  value: sim.seed,
  onInput: resetting((v) => {
    sim.seed = v;
  }),
});
addCheck({
  parent: $('sim'),
  text: 'Keep landed chips (piles)',
  checked: sim.piles,
  onChange: resetting((v) => {
    sim.piles = v;
  }),
});

// ---- World ----------------------------------------------------------------

let world: World;
let layout: Layout;
let counts: number[] = [];
let missed = 0;
let fallTimes: number[] = [];
let fullNote = '';
const pegFlash = new Map<number, number>();

const eventHandlers: HandlerMap<WorldEventByType> = {
  pegHit: (e) => pegFlash.set(e.pegIndex, performance.now()),
  landed: (e) => {
    counts[e.slotIndex] = (counts[e.slotIndex] ?? 0) + 1;
    fallTimes.push(e.chip.ageSteps * STEP);
  },
  missed: () => {
    missed++;
  },
  full: (e) => {
    fullNote = `FULL (${e.reason}) after ${world.landed.length} chips`;
  },
};

function reset(): void {
  try {
    rebuildWorld();
    $('error').textContent = '';
  } catch (err) {
    // Keep the previous board; show why the new settings were rejected.
    $('error').textContent = err instanceof Error ? err.message : String(err);
    return;
  }
  counts = new Array<number>(sim.slots).fill(0);
  missed = 0;
  fallTimes = [];
  fullNote = '';
  pegFlash.clear();
  resize();
}

function rebuildWorld(): void {
  const opts = resolveCoreOptions({
    slots: Array.from({ length: sim.slots }, (_, i) => ({ id: `s${i}`, label: `${i}` })),
    chips: [{ id: 'chip', label: 'Chip' }],
    board,
    physics: { ...physics, bias: undefined, seed: sim.seed },
  });
  Object.assign(physics, { bias: opts.physics.bias, seed: sim.seed });
  layout = buildLayout(sim.slots, opts.board);
  world = new World({ layout, physics, keepLanded: sim.piles });
}

const drop = (x01: number) => world.spawn({ kindId: 'chip', x: Math.min(1, Math.max(0, x01)) });

// ---- Input ----------------------------------------------------------------

let hoverX: number | null = null;
const toDrop01 = (clientX: number) => {
  const rect = canvas.getBoundingClientRect();
  const boardX = view.x0 + ((clientX - rect.left) / rect.width) * view.w;
  return (boardX - layout.dropMinX) / (layout.dropMaxX - layout.dropMinX);
};
canvas.addEventListener('pointermove', (e) => {
  hoverX = toDrop01(e.clientX);
});
canvas.addEventListener('pointerleave', () => {
  hoverX = null;
});
canvas.addEventListener('click', (e) => drop(toDrop01(e.clientX)));

$('drop10').addEventListener('click', () => {
  for (let i = 0; i < 10; i++) drop(Math.random());
});
$('drop100').addEventListener('click', () => {
  for (let i = 0; i < 100; i++) drop(0.5);
});
$('reset').addEventListener('click', reset);
let autoTimer: number | undefined;
$('auto').addEventListener('click', (e) => {
  const button = e.currentTarget as HTMLButtonElement;
  const on = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(on));
  clearInterval(autoTimer);
  if (on) autoTimer = window.setInterval(() => drop(Math.random()), 150);
});

// ---- Rendering ------------------------------------------------------------

/** Visible region in board units. */
const view = { x0: -1, y0: -1.5, w: 0, h: 0 };

const stage = $('stage');

/** Fits the whole board into the stage's width and the window's remaining height. */
function resize(): void {
  view.w = layout.width + 2;
  view.h = layout.height + HIST_HEIGHT - view.y0;
  const maxWidth = stage.clientWidth;
  const maxHeight = window.innerHeight - stage.getBoundingClientRect().top - 16;
  const cssWidth = Math.max(100, Math.min(maxWidth, (maxHeight * view.w) / view.h));
  const cssHeight = (cssWidth * view.h) / view.w;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
}
new ResizeObserver(() => layout && resize()).observe(stage);
window.addEventListener('resize', () => layout && resize());

function circle({ x, y, r }: Circle, color: string): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}

function draw(): void {
  clear();
  drawGuides();
  drawStatics();
  drawPegs();
  drawChips();
  drawHover();
  drawHistogram();
}

function clear(): void {
  const scale = canvas.width / view.w;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = COLORS.bg;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.setTransform(scale, 0, 0, scale, -view.x0 * scale, -view.y0 * scale);
}

/** The drop line and the rail tops. */
function drawGuides(): void {
  g.lineWidth = 0.02;
  g.strokeStyle = COLORS.guide;
  for (const y of [layout.spawnY, layout.railTopY]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(layout.width, y);
    g.stroke();
  }
}

function drawStatics(): void {
  for (const b of layout.boxes) {
    const isRail = b.x > 0 && b.x < layout.width && b.y < layout.floorY;
    g.fillStyle = isRail ? COLORS.rail : COLORS.wall;
    g.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  }
  for (const cap of layout.railCaps) circle(cap, COLORS.rail);
  for (const bump of layout.wallBumps) circle(bump, COLORS.wall);
}

function drawPegs(): void {
  const now = performance.now();
  layout.pegs.forEach((peg, i) => {
    const hit = now - (pegFlash.get(i) ?? 0) < PEG_FLASH_MS;
    circle({ ...peg, r: hit ? peg.r * 1.6 : peg.r }, hit ? COLORS.pegHit : COLORS.peg);
  });
}

function drawChips(): void {
  const r = layout.chipRadius;
  for (const c of world.landed) {
    circle({ ...c.pos, r }, c.outcome === 'landed' ? COLORS.landed : COLORS.missed);
  }
  for (const c of world.flying) circle({ ...c.pos, r }, COLORS.flying);
}

/** Ghost chip where a click would drop. */
function drawHover(): void {
  if (hoverX === null || hoverX < 0 || hoverX > 1) return;
  g.globalAlpha = 0.35;
  circle(
    { x: dropXToBoard(layout, hoverX), y: layout.spawnY, r: layout.chipRadius },
    COLORS.flying,
  );
  g.globalAlpha = 1;
}

/** Valid landings per slot, under each slot. */
function drawHistogram(): void {
  const max = Math.max(1, ...counts);
  const base = layout.height + HIST_HEIGHT - 0.4;
  g.font = '0.35px system-ui, sans-serif';
  g.textAlign = 'center';
  counts.forEach((n, i) => {
    const h = ((HIST_HEIGHT - 0.9) * n) / max;
    g.fillStyle = COLORS.bar;
    g.fillRect(i + 0.15, base - h, 0.7, h);
    g.fillStyle = COLORS.text;
    g.fillText(String(n), i + 0.5, base + 0.35);
  });
}

function stats(): void {
  const landed = counts.reduce((a, b) => a + b, 0);
  const sorted = [...fallTimes].sort((a, b) => a - b);
  const p = (q: number) => (sorted[Math.floor((sorted.length - 1) * q)] ?? 0).toFixed(2);
  const total = landed + missed;
  const missedShare = total ? ` (${((missed / total) * 100).toFixed(0)}%)` : '';
  $('stats').textContent = [
    `in flight ${world.flying.length}`,
    `landed ${landed} · missed ${missed}${missedShare}`,
    `fall p50 ${p(0.5)}s · p95 ${p(0.95)}s`,
    fullNote,
  ]
    .filter(Boolean)
    .join('\n');
}

// ---- Loop -----------------------------------------------------------------

let last = performance.now();
let acc = 0;
let statsAt = 0;

function frame(now: number): void {
  acc += (Math.min(now - last, 100) / 1000) * sim.speed;
  last = now;
  let steps = 0;
  while (acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
    for (const e of world.step()) dispatchByType(eventHandlers, e);
    acc -= STEP;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) acc = 0; // fell behind; don't spiral
  draw();
  if (now - statsAt > 200) {
    stats();
    statsAt = now;
  }
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
