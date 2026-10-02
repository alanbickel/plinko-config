// Drives the playground's board: mounts it, sends live changes through update(), and rebuilds it
// (after a short pause) when a mount-only option changes.

import { createPlinko, type PlinkoBoard, type PlinkoOptions } from '../../../../src/index';
import { answerRequest, liveOptions, mountOptions, type PlaygroundConfig } from './config';

export interface LogEntry {
  /** Milliseconds since the playground started. */
  at: number;
  callback: string;
  text: string;
}

export interface PlaygroundBoardInput {
  host: HTMLElement;
  onLog: (entry: LogEntry) => void;
  /** An invalid option (PlinkoConfigError), or '' once the board is valid again. */
  onError: (message: string) => void;
}

export interface PlaygroundBoard {
  apply(config: PlaygroundConfig): void;
  /** A fresh board: empty piles, full supply. */
  reset(): void;
  setPaused(paused: boolean): void;
  setAutoDrop(on: boolean): void;
  destroy(): void;
}

/** Physics and board sliders rebuild the board; wait until the slider stops moving. */
const REBUILD_DELAY_MS = 250;
const AUTO_DROP_MS = 600;

function callbacks(input: PlaygroundBoardInput, current: () => PlaygroundConfig) {
  const start = performance.now();
  const log = (callback: string, text: string) =>
    input.onLog({ at: performance.now() - start, callback, text });
  return {
    onPickUp: ({ chip }) => log('onPickUp', chip.label),
    onDrop: ({ chip, dropX }) => log('onDrop', `${chip.label} at x = ${dropX.toFixed(2)}`),
    onLand: ({ chip, slot, pegHits, durationMs }) =>
      log('onLand', `${chip.label} → ${slot.label} (${pegHits} pegs, ${durationMs} ms)`),
    onMiss: ({ chip }) => log('onMiss', `${chip.label} didn't reach a slot`),
    onFull: ({ reason }) => log('onFull', `locked: ${reason}`),
    onExhausted: ({ chip }) => log('onExhausted', `no ${chip.label} chips left`),
    onRequest: async ({ chip }) => {
      const answer = await answerRequest(current().supply.answer);
      log('onRequest', `more ${chip.label} chips? ${answer}`);
      return answer;
    },
  } satisfies Partial<PlinkoOptions>;
}

class Controller implements PlaygroundBoard {
  private config: PlaygroundConfig | undefined;
  private board: PlinkoBoard | undefined;
  private mountedKey = '';
  private rebuildTimer: ReturnType<typeof setTimeout> | undefined;
  private autoDropTimer: ReturnType<typeof setInterval> | undefined;
  private readonly hooks: Partial<PlinkoOptions>;

  constructor(private readonly input: PlaygroundBoardInput) {
    this.hooks = callbacks(input, () => this.config as PlaygroundConfig);
  }

  apply(config: PlaygroundConfig): void {
    this.config = config;
    clearTimeout(this.rebuildTimer);
    if (!this.board || JSON.stringify(mountOptions(config)) !== this.mountedKey) {
      this.rebuildTimer = setTimeout(() => this.reset(), this.board ? REBUILD_DELAY_MS : 0);
      return;
    }
    this.run(() => this.board?.update(liveOptions(config)));
  }

  /** Builds the board from scratch. The old one stays if the new options are invalid. */
  reset(): void {
    const { config } = this;
    if (!config) return;
    this.run(() => {
      const options = { ...mountOptions(config), ...this.hooks } as PlinkoOptions;
      const next = createPlinko(this.input.host, options);
      this.board?.destroy();
      this.board = next;
      next.update(liveOptions(config));
      this.mountedKey = JSON.stringify(mountOptions(config));
    });
  }

  setPaused(paused: boolean): void {
    if (paused) this.board?.pause();
    else this.board?.resume();
  }

  setAutoDrop(on: boolean): void {
    clearInterval(this.autoDropTimer);
    if (!on) return;
    this.autoDropTimer = setInterval(() => {
      this.board?.drop({ x: Math.random() }).catch(() => {});
    }, AUTO_DROP_MS);
  }

  destroy(): void {
    clearTimeout(this.rebuildTimer);
    clearInterval(this.autoDropTimer);
    this.board?.destroy();
    this.board = undefined;
  }

  /** Runs a board change and reports a PlinkoConfigError instead of throwing it. */
  private run(action: () => void): void {
    try {
      action();
      this.input.onError('');
    } catch (error) {
      this.input.onError(error instanceof Error ? error.message : String(error));
    }
  }
}

export function createPlaygroundBoard(input: PlaygroundBoardInput): PlaygroundBoard {
  return new Controller(input);
}
