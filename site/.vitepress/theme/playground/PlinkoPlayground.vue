<script setup lang="ts">
// The playground view. Logic lives in config.ts, board.ts and export.ts (type-checked); this file
// only binds controls to the config and shows the outputs.
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

const config = reactive<PlaygroundConfig>(initialConfig());
const host = ref<HTMLElement>();
const error = ref('');
const log = ref<LogEntry[]>([]);
const transcript = ref<Announcement[]>([]);
const paused = ref(false);
const autoDrop = ref(false);
const pane = ref<'log' | 'transcript' | 'export'>('log');
const copied = ref(false);
let board: PlaygroundBoard | undefined;

const MAX_LOG = 200;
const snapshot = (): PlaygroundConfig => JSON.parse(JSON.stringify(config));
const code = computed(() => exportConfig(snapshot()));

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
    onError: (message) => {
      error.value = message;
    },
  });
  board.apply(snapshot());
});
onBeforeUnmount(() => board?.destroy());
watch(config, () => board?.apply(snapshot()), { deep: true });
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
    <div class="toolbar">
      <button type="button" @click="board?.reset()">Reset board</button>
      <button type="button" :aria-pressed="paused" @click="paused = !paused">
        {{ paused ? 'Resume' : 'Pause' }}
      </button>
      <button type="button" :aria-pressed="autoDrop" @click="autoDrop = !autoDrop">
        Auto-drop {{ autoDrop ? 'on' : 'off' }}
      </button>
      <span class="hint">Drag a chip up into the glowing drop zone, or Tab to the board and use the keyboard.</span>
    </div>

    <div class="main">
      <div class="stage">
        <div ref="host" class="host" />
        <p v-if="error" class="error" role="alert">{{ error }} (the board keeps its last valid setup)</p>
      </div>

      <div class="controls">
        <details open>
          <summary>Content <small>rebuilds the board</small></summary>
          <h4>Slots</h4>
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
          <h4>Chips</h4>
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
            <input v-model="chip.fill" type="color" :aria-label="`${chip.label} colour`" />
            <button type="button" :disabled="config.chips.length <= 1" :aria-label="`Remove chip ${chip.label}`" @click="config.chips.splice(i, 1)">×</button>
          </div>
          <button type="button" class="add" :disabled="config.chips.length >= 6" @click="addChip">+ Chip</button>
        </details>

        <details>
          <summary>Slot labels <small>live</small></summary>
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
          <summary>Physics <small>rebuilds the board</small></summary>
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
          <summary>Board shape <small>rebuilds the board</small></summary>
          <label v-for="s in BOARD_SLIDERS" :key="s.key" class="slider" :title="s.hint">
            <span>{{ s.label }} <output>{{ config.board[s.key] }}</output></span>
            <input v-model.number="config.board[s.key]" type="range" :min="s.min" :max="s.max" :step="s.step" />
          </label>
        </details>

        <details>
          <summary>Controls <small>live</small></summary>
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
            Chips in the air at once
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
          </label>
          <label class="check"><input v-model="config.controls.attribution" type="checkbox" /> “Powered by LittleJS” link (rebuilds)</label>
        </details>

        <details>
          <summary>Supply <small>rebuilds the board</small></summary>
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
      </div>
    </div>

    <div class="panes">
      <div class="tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="pane === 'log'" @click="pane = 'log'">Callbacks</button>
        <button type="button" role="tab" :aria-selected="pane === 'transcript'" @click="pane = 'transcript'">Screen reader</button>
        <button type="button" role="tab" :aria-selected="pane === 'export'" @click="pane = 'export'">Export config</button>
      </div>
      <ol v-if="pane === 'log'" class="log" role="tabpanel">
        <li v-if="log.length === 0" class="empty">Play a chip to see callbacks here.</li>
        <li v-for="(entry, i) in log" :key="log.length - i">
          <time>{{ seconds(entry.at) }}s</time> <code>{{ entry.callback }}</code> {{ entry.text }}
        </li>
      </ol>
      <ol v-else-if="pane === 'transcript'" class="log" role="tabpanel">
        <li v-if="transcript.length === 0" class="empty">Pick up or drop a chip to see what a screen reader announces.</li>
        <li v-for="(entry, i) in transcript" :key="transcript.length - i">
          <time>{{ seconds(entry.at) }}s</time> {{ entry.text }}
        </li>
      </ol>
      <div v-else class="export" role="tabpanel">
        <button type="button" class="copy" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
        <pre><code>{{ code }}</code></pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.playground {
  display: grid;
  gap: 16px;
  margin: 0 auto;
  max-width: 1200px;
  padding: 24px;
}
.toolbar {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.toolbar .hint {
  color: var(--vp-c-text-2);
  font-size: 13px;
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
.main {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr) 320px;
}
.host {
  height: min(72vh, 680px);
}
.error {
  color: var(--vp-c-danger-1);
  font-size: 14px;
}
.controls {
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
  margin-bottom: 8px;
}
.log,
.export pre {
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  font-size: 13px;
  max-height: 280px;
  overflow: auto;
  padding: 12px;
}
.log {
  list-style: none;
}
.log time {
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
}
.log .empty {
  color: var(--vp-c-text-3);
}
.export {
  position: relative;
}
.export pre {
  max-height: 420px;
  margin: 0;
}
.copy {
  position: absolute;
  right: 8px;
  top: 8px;
}
@media (max-width: 860px) {
  .main {
    grid-template-columns: 1fr;
  }
  .host {
    height: 70vh;
  }
}
</style>
