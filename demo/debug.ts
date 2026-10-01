// Physics debug page: tune the core simulation by eye. Not part of the package.
import { buildLayout, dropXToBoard, type Layout } from '../src/core/layout';
import { DEFAULT_BOARD, DEFAULT_PHYSICS, resolveCoreOptions } from '../src/core/options';
import type { ResolvedBoard, ResolvedPhysics } from '../src/core/types';
import { STEP, World, type WorldEvent } from '../src/core/world';

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
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

// ---- Settings -------------------------------------------------------------

const physics: ResolvedPhysics = { ...DEFAULT_PHYSICS, seed: 1, bias: [] };
const board: ResolvedBoard = { ...DEFAULT_BOARD };
const sim = { slots: 7, piles: true, speed: 1, seed: 1 };

interface Slider<K extends string> {
  key: K;
  label: string;
  min: number;
  max: number;
  step: number;
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

function addSlider(
  parent: HTMLElement,
  s: { label: string; min: number; max: number; step: number },
  value: number,
  onInput: (v: number) => void,
) {
  const label = document.createElement('label');
  const input = Object.assign(document.createElement('input'), {
    type: 'range',
    min: String(s.min),
    max: String(s.max),
    step: String(s.step),
    value: String(value),
  });
  const out = document.createElement('output');
  out.value = String(value);
  input.addEventListener('input', () => {
    out.value = input.value;
    onInput(Number(input.value));
  });
  label.append(s.label, input, out);
  parent.append(label);
}

function addCheck(
  parent: HTMLElement,
  text: string,
  checked: boolean,
  onChange: (v: boolean) => void,
) {
  const label = Object.assign(document.createElement('label'), { className: 'check' });
  const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  label.append(input, text);
  parent.append(label);
}

for (const s of physicsSliders) {
  // Live: the world reads this same object every step.
  addSlider($('physics'), s, physics[s.key], (v) => {
    physics[s.key] = v;
  });
}
addCheck($('physics'), 'Chip–chip collisions', physics.chipCollisions, (v) => {
  physics.chipCollisions = v;
});

addSlider($('geometry'), { label: 'Slots', min: 1, max: 15, step: 1 }, sim.slots, (v) => {
  sim.slots = v;
  reset();
});
for (const s of boardSliders) {
  addSlider($('geometry'), s, board[s.key], (v) => {
    board[s.key] = v;
    reset();
  });
}

addSlider($('sim'), { label: 'Speed', min: 0.05, max: 2, step: 0.05 }, sim.speed, (v) => {
  sim.speed = v;
});
addSlider($('sim'), { label: 'Seed', min: 1, max: 100, step: 1 }, sim.seed, (v) => {
  sim.seed = v;
  reset();
});
addCheck($('sim'), 'Keep landed chips (piles)', sim.piles, (v) => {
  sim.piles = v;
  reset();
});

// ---- World ----------------------------------------------------------------

let world: World;
let layout: Layout;
let counts: number[] = [];
let missed = 0;
let fallTimes: number[] = [];
let fullNote = '';
const pegFlash = new Map<number, number>();

function reset() {
  try {
    const opts = resolveCoreOptions({
      slots: Array.from({ length: sim.slots }, (_, i) => ({ id: `s${i}`, label: `${i}` })),
      chips: [{ id: 'chip', label: 'Chip' }],
      board,
      physics: { ...physics, bias: undefined, seed: sim.seed },
    });
    $('error').textContent = '';
    Object.assign(physics, { bias: opts.physics.bias, seed: sim.seed });
    layout = buildLayout(sim.slots, opts.board);
    world = new World(layout, physics, { keepLanded: sim.piles });
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

function handle(events: WorldEvent[]) {
  for (const e of events) {
    if (e.type === 'pegHit') pegFlash.set(e.pegIndex, performance.now());
    else if (e.type === 'landed') {
      counts[e.slotIndex] = (counts[e.slotIndex] ?? 0) + 1;
      fallTimes.push(e.chip.ageSteps * STEP);
    } else if (e.type === 'missed') missed++;
    else if (e.type === 'full') fullNote = `FULL (${e.reason}) after ${world.landed.length} chips`;
  }
}

const drop = (x01: number) => world.spawn('chip', Math.min(1, Math.max(0, x01)));

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
function resize() {
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

function circle(x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function draw() {
  const scale = canvas.width / view.w;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, -view.x0 * scale, -view.y0 * scale);

  // Guides: drop line and rail tops.
  ctx.lineWidth = 0.02;
  ctx.strokeStyle = COLORS.guide;
  for (const y of [layout.spawnY, layout.railTopY]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(layout.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = COLORS.wall;
  for (const b of layout.boxes) {
    const isRail = b.x > 0 && b.x < layout.width && b.y < layout.floorY;
    ctx.fillStyle = isRail ? COLORS.rail : COLORS.wall;
    ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  }
  for (const c of layout.railCaps) circle(c.x, c.y, c.r, COLORS.rail);
  for (const c of layout.wallBumps) circle(c.x, c.y, c.r, COLORS.wall);

  const now = performance.now();
  layout.pegs.forEach((p, i) => {
    const hit = now - (pegFlash.get(i) ?? 0) < PEG_FLASH_MS;
    circle(p.x, p.y, hit ? p.r * 1.6 : p.r, hit ? COLORS.pegHit : COLORS.peg);
  });

  const r = layout.chipRadius;
  for (const c of world.landed) {
    circle(c.pos.x, c.pos.y, r, c.outcome === 'landed' ? COLORS.landed : COLORS.missed);
  }
  for (const c of world.flying) circle(c.pos.x, c.pos.y, r, COLORS.flying);

  if (hoverX !== null && hoverX >= 0 && hoverX <= 1) {
    ctx.globalAlpha = 0.35;
    circle(dropXToBoard(layout, hoverX), layout.spawnY, r, COLORS.flying);
    ctx.globalAlpha = 1;
  }

  // Histogram of valid landings, under each slot.
  const max = Math.max(1, ...counts);
  const base = layout.height + HIST_HEIGHT - 0.4;
  ctx.font = '0.35px system-ui, sans-serif';
  ctx.textAlign = 'center';
  counts.forEach((n, i) => {
    const h = ((HIST_HEIGHT - 0.9) * n) / max;
    ctx.fillStyle = COLORS.bar;
    ctx.fillRect(i + 0.15, base - h, 0.7, h);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(String(n), i + 0.5, base + 0.35);
  });
}

function stats() {
  const landed = counts.reduce((a, b) => a + b, 0);
  const sorted = [...fallTimes].sort((a, b) => a - b);
  const p = (q: number) => (sorted[Math.floor((sorted.length - 1) * q)] ?? 0).toFixed(2);
  const total = landed + missed;
  $('stats').textContent = [
    `in flight ${world.flying.length}`,
    `landed ${landed} · missed ${missed}${total ? ` (${((missed / total) * 100).toFixed(0)}%)` : ''}`,
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
function frame(now: number) {
  acc += (Math.min(now - last, 100) / 1000) * sim.speed;
  last = now;
  let steps = 0;
  while (acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
    handle(world.step());
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
