// The held-chip state machine (ARCHITECTURE.md §5). Keyboard, pointer, and handle calls all feed
// it. Pure: no DOM. In-flight chips live in the world, not here, which is what allows rapid fire.

import type { HandlerMap } from './dispatch';

export interface IdleState {
  name: 'idle';
}
export interface HoldingState {
  name: 'holding';
  kindId: string;
  /** Aim, 0..1 across the top of the board. */
  x: number;
  /** Height on the carry path: 0 in the tray, 1 at the drop line. */
  lift: number;
}
export interface LockedState {
  name: 'locked';
}
export interface DestroyedState {
  name: 'destroyed';
}

export type HeldState = IdleState | HoldingState | LockedState | DestroyedState;

/** What the machine needs from the rest of the board. */
export interface CommandPorts {
  /** Reserve one chip of a kind; false if none left. */
  reserve(kindId: string): boolean;
  /** Spend a reserved chip. */
  commit(kindId: string): void;
  /** Return a reserved chip to the tray. */
  release(kindId: string): void;
  inFlight(): number;
  /** Puts a chip in the world at x ∈ [0, 1]; returns its drop id. */
  spawn(kindId: string, x: number): number;
}

export interface CommandMachineInput {
  ports: CommandPorts;
  kindIds: readonly string[];
  maxInFlight: number;
  autoReload: boolean;
  /** Lift where the drop zone starts; drops from below it lose the chip. */
  dropZoneFrom: number;
  notify: (notice: Notice) => void;
}

/** The settings that can change on a live board (board.update). */
export interface MachineSettings {
  maxInFlight: number;
  autoReload: boolean;
}

export interface DropCommand {
  /** Pick up the next chip of the kind straight away, if autoReload is on. Default true. */
  reload?: boolean;
  /** Move the chip into the drop zone first, without announcing it (scripted drops). */
  carryUp?: boolean;
}

export interface PickedUpNotice {
  type: 'pickedUp';
  kindId: string;
  x: number;
}
export interface OutOfChipsNotice {
  type: 'outOfChips';
  kindId: string;
}
export interface AimedNotice {
  type: 'aimed';
  x: number;
}
export interface LiftedNotice {
  type: 'lifted';
  lift: number;
}
/** The held chip moved into or out of the drop zone. */
export interface ZoneChangedNotice {
  type: 'zoneChanged';
  inZone: boolean;
}
/** Dropped outside the drop zone: the chip is spent and falls off the board. */
export interface LostNotice {
  type: 'lost';
  kindId: string;
  x: number;
  lift: number;
}
export interface CancelledNotice {
  type: 'cancelled';
  kindId: string;
}
export interface BusyNotice {
  type: 'busy';
}
export interface DroppedNotice {
  type: 'dropped';
  kindId: string;
  x: number;
  dropId: number;
  /** Another chip of the same kind was picked up straight away (autoReload). */
  reloaded: boolean;
}
export interface LockedNotice {
  type: 'locked';
  /** Kind of the chip that was put back in the tray, if one was held. */
  returnedKindId?: string;
}
export interface DestroyedNotice {
  type: 'destroyed';
}

/** Every notice, keyed by its type. */
export interface NoticeByType {
  pickedUp: PickedUpNotice;
  outOfChips: OutOfChipsNotice;
  aimed: AimedNotice;
  lifted: LiftedNotice;
  zoneChanged: ZoneChangedNotice;
  lost: LostNotice;
  cancelled: CancelledNotice;
  busy: BusyNotice;
  dropped: DroppedNotice;
  locked: LockedNotice;
  destroyed: DestroyedNotice;
}

/** What happened, for announcements, callbacks, and rendering. */
export type Notice = NoticeByType[keyof NoticeByType];

/** One handler per notice type; leaving one out is a compile error. */
export type NoticeHandlers = HandlerMap<NoticeByType>;

type StateName = HeldState['name'];
const ACCEPTS_COMMANDS: ReadonlySet<StateName> = new Set<StateName>(['idle', 'holding']);
const FINAL: ReadonlySet<StateName> = new Set<StateName>(['locked', 'destroyed']);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Rounded so repeated nudges don't leak float noise (0.20000000000000007) into payloads. */
const round01 = (x: number) => Math.round(clamp01(x) * 1e6) / 1e6;

export class CommandMachine {
  private current: HeldState = { name: 'idle' };
  /** Where the next pickup hovers: the last aim position. */
  private lastX = 0.5;
  /** Most recently picked-up kind, for "pick up again" on the board. */
  private lastKindId: string | undefined;

  constructor(private input: CommandMachineInput) {}

  configure(settings: MachineSettings): void {
    this.input = { ...this.input, ...settings };
  }

  get state(): HeldState {
    return this.current;
  }

  get lastKind(): string | undefined {
    return this.lastKindId;
  }

  /** Returns false if the kind is unknown, none are left, or the board can't take commands. */
  pickUp(kindId: string): boolean {
    if (!ACCEPTS_COMMANDS.has(this.current.name)) return false;
    if (!this.input.kindIds.includes(kindId)) return false;
    if (this.held()?.kindId === kindId) return true;
    this.releaseHeld();
    this.current = { name: 'idle' };
    if (!this.input.ports.reserve(kindId)) {
      this.input.notify({ type: 'outOfChips', kindId });
      return false;
    }
    this.lastKindId = kindId;
    this.current = { name: 'holding', kindId, x: this.lastX, lift: 0 };
    this.input.notify({ type: 'pickedUp', kindId, x: this.lastX });
    return true;
  }

  aim(x: number): void {
    const held = this.held();
    if (!held || !Number.isFinite(x)) return;
    const next = round01(x);
    if (next === held.x) return;
    this.lastX = next;
    this.current = { ...held, x: next };
    this.input.notify({ type: 'aimed', x: next });
  }

  nudge(dx: number): void {
    const held = this.held();
    if (held) this.aim(held.x + dx);
  }

  /** Carries the held chip up (positive) or down. */
  lift(dy: number): void {
    const held = this.held();
    if (held) this.liftTo(held.lift + dy);
  }

  liftTo(lift: number): void {
    const held = this.held();
    if (!held || !Number.isFinite(lift)) return;
    const next = round01(lift);
    if (next === held.lift) return;
    const wasInZone = this.inZone(held);
    this.current = { ...held, lift: next };
    this.input.notify({ type: 'lifted', lift: next });
    if (this.inZone(this.current) !== wasInZone) {
      this.input.notify({ type: 'zoneChanged', inZone: !wasInZone });
    }
  }

  /**
   * Drops the held chip from the drop zone; outside it, the chip is lost. Returns the drop id, or
   * undefined if nothing was dropped.
   */
  drop(command: DropCommand = {}): number | undefined {
    const held = command.carryUp ? this.carryUp() : this.held();
    if (!held) return undefined;
    if (!this.inZone(held)) {
      this.loseHeld(held);
      return undefined;
    }
    if (this.input.ports.inFlight() >= this.input.maxInFlight) {
      this.input.notify({ type: 'busy' });
      return undefined;
    }
    return this.spawnHeld(held, command.reload ?? true);
  }

  /** The held chip falls off the board, wherever it is. */
  lose(): void {
    const held = this.held();
    if (held) this.loseHeld(held);
  }

  cancel(): void {
    const kindId = this.releaseHeld();
    if (kindId === undefined) return;
    this.current = { name: 'idle' };
    this.input.notify({ type: 'cancelled', kindId });
  }

  /** The board is full: put any held chip back and refuse everything from now on. */
  lock(): void {
    if (FINAL.has(this.current.name)) return;
    const returnedKindId = this.releaseHeld();
    this.current = { name: 'locked' };
    this.input.notify({ type: 'locked', returnedKindId });
  }

  destroy(): void {
    if (this.current.name === 'destroyed') return;
    this.releaseHeld();
    this.current = { name: 'destroyed' };
    this.input.notify({ type: 'destroyed' });
  }

  private carryUp(): HoldingState | undefined {
    const held = this.held();
    if (held) this.current = { ...held, lift: 1 };
    return this.held();
  }

  private inZone(held: HoldingState): boolean {
    return held.lift >= this.input.dropZoneFrom;
  }

  private spawnHeld(held: HoldingState, reload: boolean): number {
    const { ports, autoReload, notify } = this.input;
    ports.commit(held.kindId);
    const dropId = ports.spawn(held.kindId, held.x);
    const reloading = reload && autoReload;
    const reloaded = reloading && ports.reserve(held.kindId);
    this.current = reloaded ? held : { name: 'idle' };
    notify({ type: 'dropped', kindId: held.kindId, x: held.x, dropId, reloaded });
    if (reloading && !reloaded) notify({ type: 'outOfChips', kindId: held.kindId });
    return dropId;
  }

  private loseHeld(held: HoldingState): void {
    this.input.ports.commit(held.kindId);
    this.current = { name: 'idle' };
    this.input.notify({ type: 'lost', kindId: held.kindId, x: held.x, lift: held.lift });
  }

  private held(): HoldingState | undefined {
    return this.current.name === 'holding' ? this.current : undefined;
  }

  /** Returns a held chip to the tray. Gives back its kind, or undefined if nothing was held. */
  private releaseHeld(): string | undefined {
    const held = this.held();
    if (!held) return undefined;
    this.input.ports.release(held.kindId);
    return held.kindId;
  }
}
