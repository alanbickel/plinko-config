<script setup lang="ts">
// The playground view. Logic lives in config.ts, board.ts and export.ts (type-checked); this file
// only binds controls to the config and shows the outputs.
import { useData } from 'vitepress';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  type Announcement,
  createPlaygroundBoard,
  type LogEntry,
  type PlaygroundBoard,
} from './board';
import { initialConfig, newId, type PlaygroundConfig } from './config';
import {
  BOARD_SLIDERS,
  LABEL_LAYOUTS,
  MOTION_CHOICES,
  PHYSICS_SLIDERS,
  STEP_SLIDERS,
} from './controls';
import { exportConfig } from './export';
import { ANNOUNCED, BOARD_TEXT, defaultText, type LabelSpec } from './labels';

const LABEL_GROUPS = [
  { title: 'Announced', name: 'Event name', specs: ANNOUNCED },
  { title: 'Board and tray', name: 'Name', specs: BOARD_TEXT },
];
const tokenList = (spec: LabelSpec) => spec.tokens.map((t) => `{${t}}`).join(' ');

// biome-ignore lint/correctness/useHookAtTopLevel: a React rule; <script setup> is setup()
const { isDark } = useData();
const config = reactive<PlaygroundConfig>(initialConfig(isDark.value ? 'dark' : 'light'));
const host = ref<HTMLElement>();
const error = ref('');
const log = ref<LogEntry[]>([]);
const transcript = ref<Announcement[]>([]);
const paused = ref(false);
const autoDrop = ref(false);
const TABS = [
  { id: 'configure', label: 'Configure' },
  { id: 'observe', label: 'Observe' },
  { id: 'export', label: 'Export' },
] as const;
const tab = ref<(typeof TABS)[number]['id']>('configure');
const copied = ref(false);
/** Chips per slot id, then per chip id, since the board was last built. */
const tally = ref<Record<string, Record<string, number>>>({});
const missed = ref(0);
let board: PlaygroundBoard | undefined;

const MAX_LOG = 200;
const snapshot = (): PlaygroundConfig => JSON.parse(JSON.stringify(config));
const code = computed(() => exportConfig(snapshot()));

const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);
const histogram = computed(() => {
  const columns = config.slots.map((slot) => {
    const byChip = tally.value[slot.id] ?? {};
    const segments = config.chips
      .map((chip) => ({ chip, count: byChip[chip.id] ?? 0 }))
      .filter((segment) => segment.count > 0);
    return { slot, total: sum(byChip), segments };
  });
  const landed = columns.reduce((n, column) => n + column.total, 0);
  return { columns, landed, max: Math.max(1, ...columns.map((column) => column.total)) };
});

onMounted(() => {
  if (!host.value) return;
  board = createPlaygroundBoard({
    host: host.value,
    onLog: (entry) => {
      log.value = [entry, ...log.value].slice(0, MAX_LOG);
    },
    onAnnounce: (entry) => {
      transcript.value = [entry, ...transcript.value].slice(0, MAX_LOG);
    },
    onResult: ({ chipId, slotId }) => {
      if (slotId === null) {
        missed.value++;
        return;
      }
      const byChip = tally.value[slotId] ?? {};
      byChip[chipId] = (byChip[chipId] ?? 0) + 1;
      tally.value[slotId] = byChip;
    },
    onReset: () => {
      tally.value = {};
      missed.value = 0;
    },
    onError: (message) => {
      error.value = message;
    },
  });
  sizer.observe(host.value);
  remounts.observe(host.value, { childList: true, subtree: true });
  board.apply(snapshot());
});
onBeforeUnmount(() => {
  sizer.disconnect();
  remounts.disconnect();
  board?.destroy();
});
watch(config, () => board?.apply(snapshot()), { deep: true });

// Side by side, the panel ends where the board's canvas does (not its attribution link). The
// canvas arrives after mount and is replaced on remount, so each fit re-targets the observer.
const panel = ref<HTMLElement>();
const panelMaxHeight = ref<string>();
let canvas: HTMLCanvasElement | null = null;
const sizer = new ResizeObserver(() => fitPanel());
const remounts = new MutationObserver(() => fitPanel());
function fitPanel() {
  const next = host.value?.querySelector('canvas') ?? null;
  if (next !== canvas) {
    if (canvas) sizer.unobserve(canvas);
    if (next) sizer.observe(next);
    canvas = next;
  }
  if (!canvas || !panel.value) return;
  const height = canvas.getBoundingClientRect().bottom - panel.value.getBoundingClientRect().top;
  panelMaxHeight.value = height > 0 ? `${height}px` : undefined;
}
// The board follows the page's theme toggle; the Theme control overrides it until the next toggle.
watch(isDark, (dark) => (config.theme = dark ? 'dark' : 'light'));
watch(paused, (on) => board?.setPaused(on));
watch(autoDrop, (on) => board?.setAutoDrop(on));

function addSlot() {
  const label = `Slot ${config.slots.length + 1}`;
  const taken = config.slots.map((s) => s.id);
  config.slots.push({ id: newId(label, taken), label, fill: '' });
}

function addChip() {
  const label = `Chip ${config.chips.length + 1}`;
  const taken = config.chips.map((c) => c.id);
  config.chips.push({ id: newId(label, taken), label, count: null, fill: '#ffb347' });
}

function setCount(index: number, raw: string) {
  const chip = config.chips[index];
  if (chip) chip.count = raw === '' ? null : Math.max(0, Math.round(Number(raw)));
}

function setOptional(
  key: 'maxInFlight' | 'aimStep' | 'aimStepLarge' | 'liftStep' | 'liftStepLarge',
  raw: string | null,
) {
  config.controls[key] = raw === null || raw === '' ? null : Number(raw);
}

async function copy() {
  await navigator.clipboard.writeText(code.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

const seconds = (ms: number) => (ms / 1000).toFixed(1);

// Slot tints sit behind the piles, so they're translucent: #rrggbb plus a 25% alpha byte.
const DEFAULT_TINT = '#3ec7a8';
const tint = (hex: string) => `${hex}40`;
</script>

<template>
  <div class="playground">
    <div class="stage">
      <div class="toolbar">
        <button type="button" @click="board?.reset()">Reset board</button>
        <button type="button" :aria-pressed="paused" @click="paused = !paused">
          {{ paused ? 'Resume' : 'Pause' }}
        </button>
        <button type="button" :aria-pressed="autoDrop" @click="autoDrop = !autoDrop">
          Auto-drop {{ autoDrop ? 'on' : 'off' }}
        </button>
      </div>
      <p class="hint">Drag a chip up into the glowing drop zone,<br />or Tab to the board and use the keyboard.</p>
      <div ref="host" class="host" />
      <p v-if="error" class="error" role="alert">{{ error }} (the board keeps its last valid setup)</p>
    </div>

    <div ref="panel" class="panel" :style="{ maxHeight: panelMaxHeight }">
      <div class="tabs" role="tablist">
        <button
          v-for="t in TABS"
          :id="`tab-${t.id}`"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="tab === t.id"
          :aria-controls="`panel-${t.id}`"
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
      </div>
      <p v-show="tab === 'configure'" class="note">
        <em>Live</em> changes can be applied at runtime by calling <code>update()</code>. <em>Remount</em> changes are
        rejected by <code>update()</code> and require the board to be destroyed and re-mounted.
      </p>

      <div v-show="tab === 'configure'" id="panel-configure" class="stack" role="tabpanel" aria-labelledby="tab-configure">
        <details open>
          <summary>Board shape <small>remount</small></summary>
          <label v-for="s in BOARD_SLIDERS" :key="s.key" class="slider" :title="s.hint">
            <span>{{ s.label }} <output>{{ config.board[s.key] }}</output></span>
            <input v-model.number="config.board[s.key]" type="range" :min="s.min" :max="s.max" :step="s.step" />
          </label>
        </details>

        <details>
          <summary>Chips <small>remount</small></summary>
          <p class="note">Colors are live.</p>
          <div v-for="(chip, i) in config.chips" :key="chip.id" class="row">
            <input v-model="chip.label" :aria-label="`Chip ${i + 1} label`" />
            <input
              :value="chip.count ?? ''"
              type="number"
              min="0"
              placeholder="∞"
              class="count"
              :aria-label="`${chip.label} count (empty for unlimited)`"
              @change="setCount(i, ($event.target as HTMLInputElement).value)"
            />
            <input v-model="chip.fill" type="color" :aria-label="`${chip.label} color`" />
            <button type="button" :disabled="config.chips.length <= 1" :aria-label="`Remove chip ${chip.label}`" @click="config.chips.splice(i, 1)">×</button>
          </div>
          <button type="button" class="add" :disabled="config.chips.length >= 6" @click="addChip">+ Chip</button>
        </details>

        <details>
          <summary>Event messages <small>live</small></summary>
          <p class="note">
            Overrides the event messages dispatched by the component. Default messages are used for any event that you
            haven't customized. Each event lists the template strings it supports.
          </p>
          <template v-for="group in LABEL_GROUPS" :key="group.title">
            <h4>{{ group.title }}</h4>
            <label v-for="spec in group.specs" :key="spec.key" class="field">
              <span class="label-name">
                {{ group.name }}: <code>{{ spec.key }}</code> ({{ spec.hint }})
                <template v-if="spec.tokens.length">
                  <br />Supported template strings: <code>{{ tokenList(spec) }}</code>
                </template>
              </span>
              <input v-model="config.labels[spec.key]" :placeholder="defaultText(spec)" />
            </label>
          </template>
        </details>

        <details>
          <summary>Motion and key controls <small>live</small></summary>
          <label v-for="s in STEP_SLIDERS" :key="s.key" class="slider" :title="s.hint">
            <span>
              {{ s.label }} <output>{{ config.controls[s.key] ?? 'default' }}</output>
              <button v-if="config.controls[s.key] !== null" type="button" class="link" @click.prevent="setOptional(s.key, null)">reset</button>
            </span>
            <input
              :value="config.controls[s.key] ?? 0.25"
              type="range"
              :min="s.min"
              :max="s.max"
              :step="s.step"
              @input="setOptional(s.key, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="check"><input v-model="config.controls.autoReload" type="checkbox" /> Pick up another chip after a keyboard drop</label>
          <label class="field">
            Concurrent chips in play
            <input
              :value="config.controls.maxInFlight ?? ''"
              type="number"
              min="1"
              placeholder="∞"
              @change="setOptional('maxInFlight', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="field">
            Motion
            <select v-model="config.controls.motion">
              <option v-for="m in MOTION_CHOICES" :key="m" :value="m">{{ m }}</option>
            </select>
          </label>        </details>

        <details>
          <summary>Physics <small>remount</small></summary>
          <label v-for="s in PHYSICS_SLIDERS" :key="s.key" class="slider" :title="s.hint">
            <span>{{ s.label }} <output>{{ config.physics[s.key] }}</output></span>
            <input v-model.number="config.physics[s.key]" type="range" :min="s.min" :max="s.max" :step="s.step" />
          </label>
          <label class="check"><input v-model="config.physics.chipCollisions" type="checkbox" /> Chips bounce off each other</label>
          <label class="field">
            Seed
            <input
              :value="config.seed ?? ''"
              type="number"
              placeholder="random"
              @change="config.seed = ($event.target as HTMLInputElement).value === '' ? null : Math.round(Number(($event.target as HTMLInputElement).value))"
            />
          </label>
        </details>

        <details>
          <summary>Slots <small>remount</small></summary>
          <p class="note">Tints and the label layout are live.</p>
          <div v-for="(slot, i) in config.slots" :key="slot.id" class="row">
            <input v-model="slot.label" :aria-label="`Slot ${i + 1} label`" />
            <template v-if="slot.fill">
              <input
                :value="slot.fill.slice(0, 7)"
                type="color"
                :aria-label="`${slot.label} tint`"
                @input="slot.fill = tint(($event.target as HTMLInputElement).value)"
              />
              <button type="button" class="link" :aria-label="`Remove ${slot.label} tint`" @click="slot.fill = ''">no tint</button>
            </template>
            <button v-else type="button" class="link" :aria-label="`Tint ${slot.label}`" @click="slot.fill = tint(DEFAULT_TINT)">+ tint</button>
            <button type="button" :disabled="config.slots.length <= 1" :aria-label="`Remove slot ${slot.label}`" @click="config.slots.splice(i, 1)">×</button>
          </div>
          <button type="button" class="add" :disabled="config.slots.length >= 12" @click="addSlot">+ Slot</button>
          <h4>Label layout</h4>
          <label class="field">
            Layout
            <select v-model="config.slotLabels.layout">
              <option v-for="l in LABEL_LAYOUTS" :key="l.value" :value="l.value">{{ l.label }}</option>
            </select>
          </label>
          <label v-if="config.slotLabels.layout === 'vertical' || config.slotLabels.layout === 'angled'" class="check">
            <input v-model="config.slotLabels.horizontalWhenFit" type="checkbox" /> Stay horizontal when every label fits
          </label>
        </details>

        <details>
          <summary>Supply <small>remount</small></summary>
          <label class="field">
            When chips run out
            <select v-model="config.supply.refill">
              <option value="never">they're gone</option>
              <option value="onRequest">players can ask for more</option>
              <option value="interval">they trickle back</option>
            </select>
          </label>
          <label v-if="config.supply.refill === 'interval'" class="field">
            Every (ms) <input v-model.number="config.supply.everyMs" type="number" min="100" step="100" />
          </label>
          <label v-if="config.supply.refill === 'onRequest'" class="field">
            Requests are
            <select v-model="config.supply.answer">
              <option value="grant">granted</option>
              <option value="deny">denied</option>
              <option value="slow">granted after 2 s</option>
            </select>
          </label>
        </details>

        <details>
          <summary>Theme <small>live</small></summary>
          <p class="note">Starts with the page's theme and follows its toggle.</p>
          <label class="field">
            Colors
            <select v-model="config.theme">
              <option value="dark">Dark (library default)</option>
              <option value="light">Light</option>
            </select>
          </label>
        </details>
      </div>

      <div v-show="tab === 'observe'" id="panel-observe" class="stack" role="tabpanel" aria-labelledby="tab-observe">
        <details open>
          <summary>Results</summary>
          <p v-if="histogram.landed + missed === 0" class="empty">Drop chips (or turn on Auto-drop) to see where they land.</p>
          <p v-else class="tally">{{ histogram.landed }} landed, {{ missed }} missed</p>
          <ol class="histogram">
            <li v-for="column in histogram.columns" :key="column.slot.id">
              <span class="total">{{ column.total }}</span>
              <span class="track">
                <span class="bar" :style="{ height: `${(column.total / histogram.max) * 100}%` }">
                  <span
                    v-for="segment in column.segments"
                    :key="segment.chip.id"
                    :style="{ background: segment.chip.fill, flexGrow: segment.count }"
                    :title="`${segment.chip.label}: ${segment.count}`"
                  />
                </span>
              </span>
              <span class="label" :title="column.slot.label">{{ column.slot.label }}</span>
            </li>
          </ol>
        </details>
        <details>
          <summary>Callbacks</summary>
          <ol class="log">
            <li v-if="log.length === 0" class="empty">Play a chip to see callbacks here.</li>
            <li v-for="(entry, i) in log" :key="log.length - i">
              <time>{{ seconds(entry.at) }}s</time> <code>{{ entry.callback }}</code> {{ entry.text }}
            </li>
          </ol>
        </details>
        <details>
          <summary>Screen reader</summary>
          <ol class="log">
            <li v-if="transcript.length === 0" class="empty">Pick up or drop a chip to see what a screen reader announces.</li>
            <li v-for="(entry, i) in transcript" :key="transcript.length - i">
              <time>{{ seconds(entry.at) }}s</time> {{ entry.text }}
            </li>
          </ol>
        </details>
      </div>

      <div v-show="tab === 'export'" id="panel-export" class="export" role="tabpanel" aria-labelledby="tab-export">
        <button type="button" class="copy" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
        <pre><code>{{ code }}</code></pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.playground {
  align-items: start;
  display: grid;
  gap: 24px;
  /* The panel gets at least 380px and grows with the screen; the board keeps what it needs. */
  grid-template-columns: minmax(0, 1fr) minmax(380px, 1.2fr);
  margin: 0 auto;
  max-width: 1600px;
  padding: 24px;
}
/* The board stays in view while the panel scrolls (two-column layout only). */
.stage,
.panel {
  position: sticky;
  top: calc(var(--vp-nav-height) + 16px);
}
.stage {
  display: grid;
  gap: 8px;
}
/* The panel fits the viewport: tabs and the note stay put, only the tab's content scrolls. */
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* Less the playground's top and bottom padding, so the page itself doesn't scroll. */
  max-height: calc(100dvh - var(--vp-nav-height) - 48px);
}
.panel > [role='tabpanel'] {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.hint,
.note {
  color: var(--vp-c-text-2);
  font-size: 13px;
  margin: 0;
}
.hint {
  font-style: italic;
  text-align: center;
}
.note {
  font-style: italic;
}
.note em {
  font-style: normal;
  font-weight: 600;
}
.note code {
  font-size: 12px;
}
details .note {
  margin-top: 8px;
}
button {
  background: var(--vp-c-default-soft);
  border-radius: 6px;
  font-size: 14px;
  padding: 4px 12px;
}
button:hover:not(:disabled) {
  background: var(--vp-c-default-2);
}
button:disabled {
  opacity: 0.4;
}
button[aria-pressed='true'],
button[aria-selected='true'] {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}
.host {
  height: min(72vh, 680px);
}
.error {
  color: var(--vp-c-danger-1);
  font-size: 14px;
}
.stack {
  display: grid;
  gap: 8px;
  align-content: start;
}
details {
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  padding: 8px 12px;
}
summary {
  cursor: pointer;
  font-weight: 600;
}
summary small {
  color: var(--vp-c-text-3);
  font-weight: 400;
  margin-left: 6px;
}
h4 {
  font-size: 13px;
  margin: 12px 0 4px;
  color: var(--vp-c-text-2);
}
.row {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}
.row input:first-child {
  flex: 1;
  min-width: 0;
}
input:not([type='checkbox']):not([type='range']):not([type='color']),
select {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  font-size: 14px;
  padding: 2px 6px;
}
input[type='color'] {
  height: 28px;
  width: 32px;
}
.count {
  width: 56px;
}
.add {
  margin-top: 4px;
}
.slider,
.field,
.check {
  display: grid;
  font-size: 14px;
  margin-top: 8px;
}
.slider span {
  display: flex;
  gap: 6px;
}
.slider output {
  color: var(--vp-c-text-2);
  margin-left: auto;
}
.field {
  gap: 2px;
}
.label-name {
  color: var(--vp-c-text-2);
  font-size: 13px;
}
.label-name code {
  color: var(--vp-c-text-1);
  font-size: 12px;
}
.check {
  align-items: center;
  display: flex;
  gap: 6px;
}
.link {
  background: none;
  color: var(--vp-c-brand-1);
  font-size: 12px;
  padding: 0;
}
.tabs {
  display: flex;
  gap: 4px;
}
.log {
  font-size: 13px;
  list-style: none;
  margin: 8px 0 4px;
  max-height: 280px;
  overflow: auto;
  padding: 0;
}
.log time {
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
}
.empty,
.tally {
  font-size: 13px;
  margin: 8px 0;
}
.empty {
  color: var(--vp-c-text-3);
}
.histogram {
  display: flex;
  font-size: 13px;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.histogram li {
  display: grid;
  flex: 1;
  grid-template-rows: auto 160px auto;
  min-width: 0;
  text-align: center;
}
.histogram .total {
  font-variant-numeric: tabular-nums;
}
.histogram .track {
  align-items: flex-end;
  border-bottom: 1px solid var(--vp-c-divider);
  display: flex;
}
.histogram .bar {
  display: flex;
  flex-direction: column-reverse;
  width: 100%;
}
.histogram .bar span {
  flex-basis: 0;
}
.histogram .label {
  color: var(--vp-c-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Copy stays put; the code scrolls. */
.panel > .export {
  display: grid;
  gap: 8px;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}
.export pre {
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  font-size: 13px;
  margin: 0;
  overflow: auto;
  padding: 12px;
}
.copy {
  justify-self: end;
}
@media (max-width: 860px) {
  .playground {
    grid-template-columns: 1fr;
  }
  .stage,
  .panel {
    position: static;
  }
  .host {
    height: 70vh;
  }
}
</style>
