// The held-chip state machine (ARCHITECTURE.md §5). Keyboard, pointer, and handle calls all feed
// it. Pure: no DOM. In-flight chips live in the world, not here, which is what allows rapid fire.

export type HeldState =
  | { name: 'loading' }
  | { name: 'idle' }
  | { name: 'holding'; kindId: string; x: number }
  | { name: 'locked' }
  | { name: 'destroyed' };

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

export interface CommandOptions {
  kindIds: readonly string[];
  maxInFlight: number;
  autoReload: boolean;
}

/** What happened, for announcements, callbacks, and rendering. */
export type Notice =
  | { type: 'ready' }
  | { type: 'pickedUp'; kindId: string; x: number }
  | { type: 'outOfChips'; kindId: string }
  | { type: 'aimed'; x: number }
  | { type: 'cancelled'; kindId: string }
  | { type: 'busy' }
  | { type: 'dropped'; kindId: string; x: number; dropId: number; reloaded: boolean }
  | { type: 'locked'; returnedKindId?: string }
  | { type: 'destroyed' };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export class CommandMachine {
  private current: HeldState = { name: 'loading' };
  /** Where the next pickup hovers: the last aim position. */
  private lastX = 0.5;
  /** Most recently picked-up kind, for "pick up again" on the board. */
  private lastKindId: string | undefined;

  constructor(
    private readonly ports: CommandPorts,
    private readonly options: CommandOptions,
    private readonly notify: (notice: Notice) => void,
  ) {}

  get state(): HeldState {
    return this.current;
  }

  get lastKind(): string | undefined {
    return this.lastKindId;
  }

  /** Supply is loaded; pickups are allowed from now on. */
  ready(): void {
    if (this.current.name !== 'loading') return;
    this.current = { name: 'idle' };
    this.notify({ type: 'ready' });
  }

  /** Returns false if the kind is unknown, none are left, or the board can't take commands. */
  pickUp(kindId: string): boolean {
    const s = this.current;
    if (s.name !== 'idle' && s.name !== 'holding') return false;
    if (!this.options.kindIds.includes(kindId)) return false;
    if (s.name === 'holding') {
      if (s.kindId === kindId) return true;
      this.ports.release(s.kindId);
      this.current = { name: 'idle' };
    }
    if (!this.ports.reserve(kindId)) {
      this.notify({ type: 'outOfChips', kindId });
      return false;
    }
    this.lastKindId = kindId;
    this.current = { name: 'holding', kindId, x: this.lastX };
    this.notify({ type: 'pickedUp', kindId, x: this.lastX });
    return true;
  }

  aim(x: number): void {
    const s = this.current;
    if (s.name !== 'holding' || !Number.isFinite(x)) return;
    // Rounded so repeated nudges don't leak float noise (0.20000000000000007) into payloads.
    const next = Math.round(clamp01(x) * 1e6) / 1e6;
    if (next === s.x) return;
    this.lastX = next;
    this.current = { ...s, x: next };
    this.notify({ type: 'aimed', x: next });
  }

  nudge(dx: number): void {
    const s = this.current;
    if (s.name === 'holding') this.aim(s.x + dx);
  }

  /** Returns the drop id, or undefined if nothing was dropped. */
  drop(): number | undefined {
    const s = this.current;
    if (s.name !== 'holding') return undefined;
    if (this.ports.inFlight() >= this.options.maxInFlight) {
      this.notify({ type: 'busy' });
      return undefined;
    }
    this.ports.commit(s.kindId);
    const dropId = this.ports.spawn(s.kindId, s.x);
    const reloaded = this.options.autoReload && this.ports.reserve(s.kindId);
    this.current = reloaded ? s : { name: 'idle' };
    this.notify({ type: 'dropped', kindId: s.kindId, x: s.x, dropId, reloaded });
    if (this.options.autoReload && !reloaded) this.notify({ type: 'outOfChips', kindId: s.kindId });
    return dropId;
  }

  cancel(): void {
    const s = this.current;
    if (s.name !== 'holding') return;
    this.ports.release(s.kindId);
    this.current = { name: 'idle' };
    this.notify({ type: 'cancelled', kindId: s.kindId });
  }

  /** The board is full: put any held chip back and refuse everything from now on. */
  lock(): void {
    const s = this.current;
    if (s.name === 'locked' || s.name === 'destroyed') return;
    let returnedKindId: string | undefined;
    if (s.name === 'holding') {
      this.ports.release(s.kindId);
      returnedKindId = s.kindId;
    }
    this.current = { name: 'locked' };
    this.notify({ type: 'locked', returnedKindId });
  }

  destroy(): void {
    const s = this.current;
    if (s.name === 'destroyed') return;
    if (s.name === 'holding') this.ports.release(s.kindId);
    this.current = { name: 'destroyed' };
    this.notify({ type: 'destroyed' });
  }
}
