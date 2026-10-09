<script setup lang="ts">
// One live example: mounts the board with the example's own mount() (the code shown beside it),
// remounts it on "Start over", and destroys it when the page goes away.
import type { PlinkoBoard } from 'plinko-config';
import { onBeforeUnmount, onMounted, ref } from 'vue';

/** What every live example exports: mount a board in `target`, show results in `output`. */
type Mount = (target: HTMLElement, output: HTMLElement) => PlinkoBoard;

const props = defineProps<{
  mount: Mount;
  /** What the result panel says before the first landing. */
  placeholder: string;
}>();

const target = ref<HTMLElement>();
const output = ref<HTMLElement>();
let board: PlinkoBoard | undefined;

/** A fresh board: empty slots, a full supply, and the placeholder text. */
function start(): void {
  board?.destroy();
  if (!target.value || !output.value) return;
  // Set here, not in the template: the example's callbacks replace this text.
  output.value.textContent = props.placeholder;
  delete output.value.dataset.theme;
  board = props.mount(target.value, output.value);
}

onMounted(start);
onBeforeUnmount(() => board?.destroy());
</script>

<template>
  <div class="example-board">
    <div ref="target" class="example-host" />
    <div ref="output" class="example-output" />
    <button type="button" class="example-restart" @click="start">Start over</button>
  </div>
</template>
