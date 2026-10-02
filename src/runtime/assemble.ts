// Builds one board's parts and the context that connects them.

import { buildLayout } from '../core/layout';
import { resolveCoreOptions } from '../core/options';
import { World } from '../core/world';
import { CommandMachine, type Notice } from './commands';
import { resolveRuntimeConfig } from './config';
import { type BoardContext, initialUiState, refresh } from './context';
import { dispatchByType } from './dispatch';
import { createLoop } from './frame';
import { noticeHandlers } from './notices';
import { resolveTheme } from './theme';
import type { PlinkoOptions } from './types';
import { Announcer } from './view/a11y';
import { CanvasView } from './view/canvas';
import { createDom } from './view/dom';

export interface AssembleInput {
  host: HTMLElement;
  options: PlinkoOptions;
}

/** The parts that don't need the finished context. */
type BaseContext = Omit<BoardContext, 'machine' | 'loop'>;

export function assemble({ host, options }: AssembleInput): BoardContext {
  const base = createBase({ host, options });
  // The machine and loop close over the context; nothing calls them until the board is ready.
  const ctx = base as BoardContext;
  ctx.machine = createMachine(ctx);
  ctx.loop = createLoop(ctx);
  return ctx;
}

function createBase({ host, options }: AssembleInput): BaseContext {
  const core = resolveCoreOptions(options);
  const { slots, chips } = core;
  const config = resolveRuntimeConfig({ options, slotCount: slots.length });
  const win = host.ownerDocument.defaultView;
  const layout = buildLayout(slots.length, core.board);
  const dom = createDom({ host, labels: config.labels, attribution: config.attribution });
  const theme = resolveTheme(options.theme, win?.getComputedStyle(host));
  return {
    host,
    win,
    options,
    config,
    slots,
    chips,
    kindIds: chips.map((c) => c.id),
    world: new World({ layout, physics: core.physics }),
    dom,
    view: new CanvasView({
      canvas: dom.canvas,
      layout,
      kinds: chips,
      slots,
      theme,
      reducedMotion: prefersReducedMotion(win),
    }),
    announcer: new Announcer({ live: dom.live, labels: config.labels }),
    ui: initialUiState(),
    settling: new Map(),
    events: [],
  };
}

function createMachine(ctx: BoardContext): CommandMachine {
  const handlers = noticeHandlers(ctx);
  return new CommandMachine({
    ports: {
      reserve: () => true, // unlimited supply until M4
      commit: () => {},
      release: () => {},
      inFlight: () => ctx.world.flying.length,
      spawn: (kindId, x) => ctx.world.spawn({ kindId, x, seed: ctx.ui.pendingSeed }).id,
    },
    kindIds: ctx.kindIds,
    maxInFlight: ctx.config.maxInFlight,
    autoReload: ctx.config.autoReload,
    notify: (notice: Notice) => {
      dispatchByType(handlers, notice);
      refresh(ctx);
    },
  });
}

function prefersReducedMotion(win: Window | null): boolean {
  return win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
