// createPlinko(): the public entry point. Assembles a board, attaches it, returns the handle.

import { PlinkoConfigError } from '../core/validate';
import { assemble } from './assemble';
import { createHandle } from './handle';
import { attachInput } from './input/attach';
import { observeHost } from './observe';
import { fitToHost } from './sizing';
import { startRefills, supplyChanged } from './supply';
import type { PlinkoBoard, PlinkoOptions } from './types';

/**
 * Mounts a Plinko board inside `target` and starts it.
 *
 * @param target - The element to mount in, or a CSS selector for it.
 * @param options - Slots, chips, and everything else. See {@link PlinkoOptions}.
 * @returns A handle for playing the board from code, changing options, and cleaning up.
 * @throws {@link PlinkoConfigError} If `target` matches nothing or an option is invalid.
 *
 * @example
 * ```ts
 * const board = createPlinko('#board', {
 *   slots: [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }],
 *   chips: [{ id: 'theme', label: 'Theme' }],
 *   onLand: ({ slot }) => setTheme(slot.id),
 * });
 * ```
 */
export function createPlinko<CV = unknown, SV = unknown>(
  target: HTMLElement | string,
  options: PlinkoOptions<CV, SV>,
): PlinkoBoard<CV, SV> {
  const host = resolveHost(target);
  // Internally chips and slots are opaque; the generics only type the host's callbacks.
  const ctx = assemble({ host, options: options as unknown as PlinkoOptions });
  const teardown = [attachInput(ctx), observeHost(ctx), startRefills(ctx)];
  fitToHost(ctx);
  supplyChanged(ctx); // first report; also locks at once if there are no chips at all
  // Internally callbacks take opaque chips and slots; the handle's generics are for the host.
  return createHandle({ ctx, teardown }) as PlinkoBoard<CV, SV>;
}

function resolveHost(target: HTMLElement | string): HTMLElement {
  const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!host) throw new PlinkoConfigError(`createPlinko: no element matches "${String(target)}"`);
  return host;
}
