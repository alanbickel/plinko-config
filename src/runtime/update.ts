// board.update(): changes options on a live board. Mount-only options are refused (destroy and
// create a new board instead), so a live board never silently loses its piles.

import { check } from '../core/validate';
import { resolveRuntimeConfig } from './config';
import { type BoardContext, refresh } from './context';
import { resolveLook } from './look';
import type { BoardUpdate, MountOnlyOption, PlinkoOptions } from './types';
import { applyLabels } from './view/dom';

const MOUNT_ONLY: readonly MountOnlyOption[] = [
  'slots',
  'chips',
  'board',
  'physics',
  'supply',
  'attribution',
];

/** Validates everything first, so a bad update changes nothing. */
export function updateBoard(ctx: BoardContext, update: BoardUpdate): void {
  const refused = MOUNT_ONLY.filter((key) => key in update);
  check(
    refused.length === 0,
    `update() can't change ${refused.join(', ')}: destroy the board and create a new one`,
  );
  const options: PlinkoOptions = { ...ctx.options, ...update };
  const config = resolveRuntimeConfig({ options, layout: ctx.world.layout });
  const look = resolveLook({ options, host: ctx.host, win: ctx.win });
  ctx.options = options;
  ctx.config = config;
  ctx.machine.configure({ maxInFlight: config.maxInFlight, autoReload: config.autoReload });
  ctx.announcer.setLabels(config.labels);
  applyLabels(ctx.dom, config.labels);
  ctx.view.setLook(look);
  refresh(ctx);
}
