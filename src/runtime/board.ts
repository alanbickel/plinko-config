// createPlinko(): the public entry point. Assembles a board, attaches it, returns the handle.

import { PlinkoConfigError } from '../core/validate';
import { assemble } from './assemble';
import { refresh } from './context';
import { createHandle } from './handle';
import { attachInput } from './input/attach';
import { observeHost } from './observe';
import { fitToHost } from './sizing';
import type { PlinkoBoard, PlinkoOptions } from './types';

export function createPlinko<CV = unknown, SV = unknown>(
  target: HTMLElement | string,
  options: PlinkoOptions<CV, SV>,
): PlinkoBoard {
  const host = resolveHost(target);
  // Internally chips and slots are opaque; the generics only type the host's callbacks.
  const ctx = assemble({ host, options: options as unknown as PlinkoOptions });
  const teardown = [attachInput(ctx), observeHost(ctx)];
  fitToHost(ctx);
  ctx.machine.ready(); // unlimited supply is ready immediately; M4 makes this async
  refresh(ctx);
  return createHandle({ ctx, teardown });
}

function resolveHost(target: HTMLElement | string): HTMLElement {
  const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!host) throw new PlinkoConfigError(`createPlinko: no element matches "${String(target)}"`);
  return host;
}
