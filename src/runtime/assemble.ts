// Builds one board's parts and the context that connects them.

import { buildLayout } from '../core/layout';
import { resolveCoreOptions } from '../core/options';
import { Supply } from '../core/supply';
import { World } from '../core/world';
import { CommandMachine, type Notice, type NoticeByType } from './commands';
import { resolveRuntimeConfig } from './config';
import { type BoardContext, initialUiState, refresh } from './context';
import { dispatchByType } from './dispatch';
import { createLoop } from './frame';
import { resolveLook } from './look';
import { noticeHandlers } from './notices';
import { supplyChanged } from './supply';
import type { PlinkoOptions } from './types';
import { Announcer } from './view/a11y';
import { CanvasView } from './view/canvas';
import { createDom } from './view/dom';
import { carryPath } from './view/geometry';

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
  const layout = buildLayout(slots.length, core.board);
  const config = resolveRuntimeConfig({ options, layout });
  const win = host.ownerDocument.defaultView;
  const dom = createDom({ host, labels: config.labels, attribution: config.attribution });
  const look = resolveLook({ options, host, win });
  const reducedMotion = prefersReducedMotion(win);
  return {
    host,
    win,
    reducedMotion,
    options,
    config,
    slots,
    chips,
    kindIds: chips.map((c) => c.id),
    world: new World({ layout, physics: core.physics }),
    carry: carryPath(layout),
    supply: new Supply({ kinds: chips, refill: config.refill }),
    dom,
    view: new CanvasView({
      canvas: dom.canvas,
      layout,
      kinds: chips,
      slots,
      ...look,
      reducedMotion,
    }),
    announcer: new Announcer({ live: dom.live, labels: config.labels }),
    ...emptyState(),
  };
}

/** What a new board starts with: nothing pending, nothing settling, default UI state. */
function emptyState(): Pick<BoardContext, 'requests' | 'ui' | 'settling' | 'events'> {
  return { requests: new Map(), ui: initialUiState(), settling: new Map(), events: [] };
}

function createMachine(ctx: BoardContext): CommandMachine {
  const handlers = noticeHandlers(ctx);
  return new CommandMachine({
    ports: {
      reserve: (kindId) => ctx.supply.reserve(kindId),
      commit: (kindId) => ctx.supply.commit(kindId),
      release: (kindId) => ctx.supply.release(kindId),
      inFlight: () => ctx.world.flying.length,
      spawn: (kindId, x) => ctx.world.spawn({ kindId, x, seed: ctx.ui.pendingSeed }).id,
    },
    kindIds: ctx.kindIds,
    maxInFlight: ctx.config.maxInFlight,
    autoReload: ctx.config.autoReload,
    dropZoneFrom: ctx.carry.zoneFrom,
    notify: (notice: Notice) => {
      dispatchByType(handlers, notice);
      (CHANGES_SUPPLY.has(notice.type) ? supplyChanged : refresh)(ctx);
    },
  });
}

/** Notices after which chip counts may have changed (a chip taken, spent, or put back). */
const CHANGES_SUPPLY: ReadonlySet<keyof NoticeByType> = new Set<keyof NoticeByType>([
  'pickedUp',
  'cancelled',
  'dropped',
  'lost',
  'locked',
]);

function prefersReducedMotion(win: Window | null): boolean {
  return win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
