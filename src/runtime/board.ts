// createPlinko(): wires core, input, views, and the frame loop together, and returns the handle.

import { buildLayout } from '../core/layout';
import { PlinkoConfigError, resolveCoreOptions } from '../core/options';
import type { ChipKindConfig } from '../core/types';
import { STEP, World, type WorldEvent } from '../core/world';
import { CommandMachine, type Notice } from './commands';
import { interpretKey, resolveKeys, type Zone } from './input/keyboard';
import { DEFAULT_LABELS, type Labels } from './labels';
import { FrameLoop } from './loop';
import { resolveTheme } from './theme';
import type { DropOptions, PlinkoBoard, PlinkoOptions, SettleDetails, Settled } from './types';
import { Announcer } from './view/a11y';
import { CanvasView } from './view/canvas';
import { createDom } from './view/dom';

const PEG_FLASH_MS = 120;

export function createPlinko<CV = unknown, SV = unknown>(
  target: HTMLElement | string,
  options: PlinkoOptions<CV, SV>,
): PlinkoBoard {
  const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!host) throw new PlinkoConfigError(`createPlinko: no element matches "${String(target)}"`);

  const core = resolveCoreOptions(options);
  const { slots, chips } = core;
  const maxInFlight = options.maxInFlight ?? Infinity;
  const aimStep = options.aimStep ?? 1 / (4 * slots.length);
  const aimStepLarge = options.aimStepLarge ?? 1 / slots.length;
  check(
    maxInFlight === Infinity || (Number.isInteger(maxInFlight) && maxInFlight >= 1),
    'maxInFlight must be a positive integer or Infinity',
  );
  check(inStepRange(aimStep), 'aimStep must be a number in (0, 1]');
  check(inStepRange(aimStepLarge), 'aimStepLarge must be a number in (0, 1]');

  const labels: Labels = { ...DEFAULT_LABELS, ...options.labels };
  const keys = resolveKeys(options.keys);
  const win = host.ownerDocument.defaultView;
  const theme = resolveTheme(options.theme, win?.getComputedStyle(host));
  const reducedMotion = win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const layout = buildLayout(slots.length, core.board);
  const world = new World(layout, core.physics);
  const dom = createDom(host, labels, options.attribution ?? true);
  const view = new CanvasView(dom.canvas, layout, chips, slots, theme, reducedMotion);
  const announcer = new Announcer(dom.live, () => labels);
  const kindIds = chips.map((c) => c.id);
  const kindById = new Map(chips.map((c) => [c.id, c]));

  let zone: Zone = 'tray';
  let selected = 0;
  let focused = false;
  let pausedByHost = false;
  let offscreen = false;
  let pendingSeed: number | undefined;
  let lockedMessage: string | undefined;
  const pegHits = new Map<number, number>();
  let lastPegHit = -Infinity;
  const settling = new Map<number, (s: Settled) => void>();
  let events: WorldEvent[] = [];

  /** Host callbacks are untrusted: a throwing callback must not break the board. */
  const safe = <A extends unknown[]>(fn: ((...args: A) => void) | undefined, ...args: A) => {
    try {
      fn?.(...args);
    } catch (err) {
      console.error('plinko-config: a callback threw', err);
    }
  };
  const kind = (id: string) => kindById.get(id) as ChipKindConfig<CV>;

  const machine = new CommandMachine(
    {
      reserve: () => true, // unlimited supply until M4
      commit: () => {},
      release: () => {},
      inFlight: () => world.flying.length,
      spawn: (kindId, x) => world.spawn(kindId, x, pendingSeed).id,
    },
    { kindIds, maxInFlight, autoReload: options.autoReload ?? true },
    onNotice,
  );

  function onNotice(n: Notice): void {
    switch (n.type) {
      case 'pickedUp':
        zone = 'board';
        selected = kindIds.indexOf(n.kindId);
        safe(options.onPickUp, kind(n.kindId));
        announcer.say(labels.pickedUp(kind(n.kindId)));
        break;
      case 'cancelled':
        zone = 'tray';
        announcer.say(labels.cancelled(kind(n.kindId)));
        break;
      case 'outOfChips':
        announcer.say(labels.outOfChips(kind(n.kindId)));
        break;
      case 'busy':
        announcer.say(labels.busy);
        break;
      case 'dropped':
        safe(options.onDrop, kind(n.kindId), { dropId: n.dropId, dropX: n.x });
        if (!n.reloaded) announcer.say(labels.dropped(kind(n.kindId)));
        break;
      case 'locked':
        zone = 'tray';
        lockedMessage = labels.locked;
        // Announce the landing that filled the board first, so the lock message is the last word.
        announcer.flush();
        announcer.say(labels.locked);
        break;
      default:
        break;
    }
    syncAttributes();
    loop.wake();
    loop.redraw();
  }

  function dispatch(): void {
    const batch = events;
    events = [];
    for (const e of batch) {
      if (e.type === 'pegHit') {
        lastPegHit = performance.now();
        pegHits.set(e.pegIndex, lastPegHit);
        safe(options.onPegHit, kind(e.chip.kindId), {
          dropId: e.chip.id,
          dropX: e.chip.dropX,
          pegIndex: e.pegIndex,
          speed: e.speed,
        });
      } else if (e.type === 'landed' || e.type === 'missed') {
        const chip = kind(e.chip.kindId);
        const details: SettleDetails = {
          dropId: e.chip.id,
          dropX: e.chip.dropX,
          pegHits: e.chip.pegHits,
          durationMs: Math.round(e.chip.ageSteps * STEP * 1000),
          seed: e.chip.seed,
        };
        if (e.type === 'landed') {
          const slot = slots[e.slotIndex] as (typeof slots)[number];
          safe(options.onLand, chip, slot, details);
          announcer.settled(chip, slot);
        } else {
          safe(options.onMiss, chip, details);
          announcer.settled(chip, undefined);
        }
        settling.get(e.chip.id)?.({ dropId: e.chip.id });
        settling.delete(e.chip.id);
      } else if (e.type === 'full') {
        safe(options.onFull, { reason: e.reason });
        machine.lock();
      }
    }
  }

  const loop = new FrameLoop({
    step: () => {
      events.push(...world.step());
    },
    render: (alpha) => {
      dispatch(); // after stepping, never mid-step (ARCHITECTURE.md §9)
      const s = machine.state;
      view.render({
        flying: world.flying,
        settled: world.landed,
        heldX: s.name === 'holding' ? s.x : undefined,
        heldKindId: s.name === 'holding' ? s.kindId : undefined,
        selected,
        zone,
        focused,
        counts: chips.map(() => undefined),
        lockedMessage,
        pegHits,
        alpha,
        now: performance.now(),
      });
    },
    active: () =>
      world.flying.length > 0 || events.length > 0 || performance.now() - lastPegHit < PEG_FLASH_MS,
  });

  function syncAttributes(): void {
    dom.wrapper.dataset.state = machine.state.name;
    dom.wrapper.dataset.zone = zone;
  }

  // ---- Input --------------------------------------------------------------

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const s = machine.state;
    const lastKind = machine.lastKind;
    const action = interpretKey(
      e,
      {
        zone,
        holding: s.name === 'holding',
        selected,
        kindCount: chips.length,
        lastKindIndex: lastKind === undefined ? undefined : kindIds.indexOf(lastKind),
        aimStep,
        aimStepLarge,
      },
      keys,
    );
    if (!action) return;
    e.preventDefault();
    if (s.name === 'locked') {
      if (action.type === 'pickUp') announcer.say(labels.locked);
      return;
    }
    switch (action.type) {
      case 'select':
        selected = action.index;
        announcer.say(labels.selected(chips[selected] as ChipKindConfig<CV>));
        break;
      case 'pickUp':
        machine.pickUp(kindIds[action.index] as string);
        break;
      case 'nudge':
        machine.nudge(action.dx);
        break;
      case 'aim':
        machine.aim(action.x);
        break;
      case 'drop':
        machine.drop();
        break;
      case 'cancel':
        machine.cancel();
        break;
      case 'zone':
        zone = action.zone;
        announcer.say(labels.selected(chips[selected] as ChipKindConfig<CV>));
        break;
    }
    syncAttributes();
    loop.redraw();
  };
  const onFocus = () => {
    focused = true;
    loop.redraw();
  };
  const onBlur = () => {
    focused = false;
    loop.redraw();
  };
  dom.canvas.addEventListener('keydown', onKeyDown);
  dom.canvas.addEventListener('focus', onFocus);
  dom.canvas.addEventListener('blur', onBlur);

  // ---- Size and visibility -----------------------------------------------

  /**
   * Fills the host's width. If the host has a height of its own (not just our content), the
   * board also fits inside it, centred. Measured by collapsing the canvas for a moment: whatever
   * height the host keeps then is its own.
   */
  const fitToHost = () => {
    const { canvas, wrapper } = dom;
    canvas.style.height = '0px';
    const cs = win?.getComputedStyle(host);
    const padding = cs ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) : 0;
    const rest = wrapper.offsetHeight; // attribution and anything else besides the canvas
    const roomHeight = host.clientHeight - padding - rest;
    let width = wrapper.clientWidth || 300;
    if (roomHeight > 1) width = Math.min(width, roomHeight * view.aspect);
    const height = view.resize(width, win?.devicePixelRatio || 1);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    loop.redraw();
  };
  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(fitToHost);
  resizeObserver?.observe(dom.wrapper);
  resizeObserver?.observe(host);

  const updatePause = () => (pausedByHost || offscreen ? loop.pause() : loop.resume());
  const visibility =
    typeof IntersectionObserver === 'undefined'
      ? undefined
      : new IntersectionObserver(([entry]) => {
          offscreen = entry ? !entry.isIntersecting : false;
          updatePause();
        });
  visibility?.observe(dom.wrapper);

  fitToHost();
  machine.ready(); // unlimited supply is ready immediately; M4 makes this async
  syncAttributes();

  // ---- Handle -------------------------------------------------------------

  let destroyed = false;
  return {
    element: dom.wrapper,
    pickUp: (chipId) => machine.pickUp(chipId),
    aim: (x) => machine.aim(x),
    cancel: () => machine.cancel(),
    drop(opts: DropOptions = {}) {
      const s = machine.state;
      const wanted =
        opts.chip ??
        (s.name === 'holding' ? s.kindId : (machine.lastKind ?? kindIds[selected] ?? ''));
      const holdingWanted = s.name === 'holding' && s.kindId === wanted;
      if (!holdingWanted && !machine.pickUp(wanted)) {
        return Promise.reject(new Error(`plinko-config: can't pick up "${wanted}" (${s.name})`));
      }
      if (opts.x !== undefined) machine.aim(opts.x);
      pendingSeed = opts.seed;
      const dropId = machine.drop();
      pendingSeed = undefined;
      if (dropId === undefined) {
        return Promise.reject(new Error(`plinko-config: can't drop (${machine.state.name})`));
      }
      return new Promise<Settled>((resolve) => settling.set(dropId, resolve));
    },
    pause() {
      pausedByHost = true;
      updatePause();
    },
    resume() {
      pausedByHost = false;
      updatePause();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      machine.destroy();
      loop.stop();
      announcer.destroy();
      resizeObserver?.disconnect();
      visibility?.disconnect();
      dom.canvas.removeEventListener('keydown', onKeyDown);
      dom.canvas.removeEventListener('focus', onFocus);
      dom.canvas.removeEventListener('blur', onBlur);
      // Chips vanish with the board, so they are no longer in flight.
      for (const [dropId, resolve] of settling) resolve({ dropId });
      settling.clear();
      dom.wrapper.remove();
    },
  };
}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new PlinkoConfigError(message);
}

const inStepRange = (n: number) => typeof n === 'number' && n > 0 && n <= 1;
