import { describe, expect, it } from 'vitest';
import { CommandMachine, type CommandPorts, type Notice } from './commands';

interface SetupInput {
  maxInFlight?: number;
  autoReload?: boolean;
  /** Chips available per kind; unlimited when not given. */
  stock?: Record<string, number>;
  /** Lift where the drop zone starts. Default 0: everywhere is the drop zone. */
  dropZoneFrom?: number;
}

interface Spawned {
  kindId: string;
  x: number;
}

interface Harness {
  machine: CommandMachine;
  notices: Notice[];
  stock: Record<string, number>;
  reserved: Record<string, number>;
  spawned: Spawned[];
  setFlying: (n: number) => void;
}

function setup(opts: SetupInput = {}): Harness {
  const stock: Record<string, number> = { on: Infinity, off: Infinity, ...opts.stock };
  const reserved: Record<string, number> = {};
  const spawned: Spawned[] = [];
  let flying = 0;
  const notices: Notice[] = [];
  const ports: CommandPorts = {
    reserve(kindId: string) {
      if ((stock[kindId] ?? 0) <= 0) return false;
      stock[kindId] = (stock[kindId] ?? 0) - 1;
      reserved[kindId] = (reserved[kindId] ?? 0) + 1;
      return true;
    },
    commit(kindId: string) {
      reserved[kindId] = (reserved[kindId] ?? 0) - 1;
    },
    release(kindId: string) {
      reserved[kindId] = (reserved[kindId] ?? 0) - 1;
      stock[kindId] = (stock[kindId] ?? 0) + 1;
    },
    inFlight: () => flying,
    spawn(kindId: string, x: number) {
      spawned.push({ kindId, x });
      flying++;
      return spawned.length - 1;
    },
  };
  const machine = new CommandMachine({
    ports,
    kindIds: ['on', 'off'],
    maxInFlight: opts.maxInFlight ?? Infinity,
    autoReload: opts.autoReload ?? false,
    dropZoneFrom: opts.dropZoneFrom ?? 0,
    notify: (n) => notices.push(n),
  });
  return {
    machine,
    notices,
    stock,
    reserved,
    spawned,
    setFlying: (n: number) => {
      flying = n;
    },
  };
}

describe('CommandMachine', () => {
  it('starts idle, with nothing to report', () => {
    const t = setup();
    expect(t.machine.state.name).toBe('idle');
    expect(t.notices).toEqual([]);
  });

  it('picks up, aims, and drops', () => {
    const t = setup();
    expect(t.machine.pickUp('on')).toBe(true);
    expect(t.machine.state).toEqual({ name: 'holding', kindId: 'on', x: 0.5, lift: 0 });
    t.machine.nudge(0.1);
    t.machine.aim(0.9);
    const dropId = t.machine.drop();
    expect(dropId).toBe(0);
    expect(t.spawned).toEqual([{ kindId: 'on', x: 0.9 }]);
    expect(t.machine.state.name).toBe('idle');
    expect(t.reserved.on).toBe(0);
    expect(t.notices.map((n) => n.type)).toEqual(['pickedUp', 'aimed', 'aimed', 'dropped']);
  });

  it('clamps aim to [0, 1] and ignores no-op and non-finite aims', () => {
    const t = setup();
    t.machine.pickUp('on');
    t.machine.aim(5);
    t.machine.nudge(1);
    t.machine.aim(Number.NaN);
    t.machine.nudge(-9);
    expect(t.machine.state).toMatchObject({ x: 0 });
    expect(t.notices.filter((n) => n.type === 'aimed')).toEqual([
      { type: 'aimed', x: 1 },
      { type: 'aimed', x: 0 },
    ]);
  });

  it('remembers the last aim position for the next pickup', () => {
    const t = setup();
    t.machine.pickUp('on');
    t.machine.aim(0.2);
    t.machine.drop();
    t.machine.pickUp('off');
    expect(t.machine.state).toEqual({ name: 'holding', kindId: 'off', x: 0.2, lift: 0 });
    expect(t.machine.lastKind).toBe('off');
  });

  it('cancel returns the chip to the tray', () => {
    const t = setup({ stock: { on: 1 } });
    t.machine.pickUp('on');
    expect(t.stock.on).toBe(0);
    t.machine.cancel();
    expect(t.stock.on).toBe(1);
    expect(t.machine.state.name).toBe('idle');
    expect(t.notices.at(-1)).toEqual({ type: 'cancelled', kindId: 'on' });
  });

  it('reports out of chips and stays idle', () => {
    const t = setup({ stock: { on: 0 } });
    expect(t.machine.pickUp('on')).toBe(false);
    expect(t.machine.state.name).toBe('idle');
    expect(t.notices).toEqual([{ type: 'outOfChips', kindId: 'on' }]);
  });

  it('rejects unknown kinds', () => {
    const t = setup();
    expect(t.machine.pickUp('nope')).toBe(false);
    expect(t.notices).toEqual([]);
  });

  it('switching kinds while holding releases the first', () => {
    const t = setup({ stock: { on: 1, off: 1 } });
    t.machine.pickUp('on');
    expect(t.machine.pickUp('off')).toBe(true);
    expect(t.stock).toMatchObject({ on: 1, off: 0 });
    expect(t.machine.pickUp('off')).toBe(true); // same kind: no-op
    expect(t.stock.off).toBe(0);
  });

  it('auto-reloads the same kind at the same x', () => {
    const t = setup({ autoReload: true, stock: { on: 2 } });
    t.machine.pickUp('on');
    t.machine.aim(0.3);
    t.machine.drop();
    expect(t.machine.state).toEqual({ name: 'holding', kindId: 'on', x: 0.3, lift: 0 });
    expect(t.notices.at(-1)).toMatchObject({ type: 'dropped', reloaded: true });

    t.machine.drop();
    expect(t.machine.state.name).toBe('idle');
    expect(t.notices.slice(-2)).toEqual([
      { type: 'dropped', kindId: 'on', x: 0.3, dropId: 1, reloaded: false },
      { type: 'outOfChips', kindId: 'on' },
    ]);
  });

  it('waits when maxInFlight is reached', () => {
    const t = setup({ maxInFlight: 2 });
    t.machine.pickUp('on');
    t.setFlying(2);
    expect(t.machine.drop()).toBeUndefined();
    expect(t.machine.state.name).toBe('holding');
    expect(t.notices.at(-1)).toEqual({ type: 'busy' });
    t.setFlying(1);
    expect(t.machine.drop()).toBe(0);
  });

  it('lock returns a held chip to the tray and refuses everything after', () => {
    const t = setup({ stock: { on: 1 } });
    t.machine.pickUp('on');
    t.machine.lock();
    expect(t.stock.on).toBe(1);
    expect(t.machine.state.name).toBe('locked');
    expect(t.notices.at(-1)).toEqual({ type: 'locked', returnedKindId: 'on' });

    t.notices.length = 0;
    expect(t.machine.pickUp('on')).toBe(false);
    t.machine.aim(0.1);
    expect(t.machine.drop()).toBeUndefined();
    t.machine.cancel();
    t.machine.lock();
    expect(t.notices).toEqual([]);
  });

  it('lock while idle has nothing to return', () => {
    const t = setup();
    t.machine.lock();
    expect(t.notices).toEqual([{ type: 'locked', returnedKindId: undefined }]);
  });

  it('destroy releases a held chip, once', () => {
    const t = setup({ stock: { on: 1 } });
    t.machine.pickUp('on');
    t.machine.destroy();
    t.machine.destroy();
    expect(t.stock.on).toBe(1);
    expect(t.machine.state.name).toBe('destroyed');
    expect(t.notices.filter((n) => n.type === 'destroyed')).toHaveLength(1);
    expect(t.machine.pickUp('on')).toBe(false);
  });
});

describe('carrying to the drop zone', () => {
  const ZONE = 0.8;
  const types = (t: Harness) => t.notices.map((n) => n.type);

  it('starts in the tray and carries up and down, clamped to [0, 1]', () => {
    const t = setup({ dropZoneFrom: ZONE });
    t.machine.pickUp('on');
    t.machine.lift(0.3);
    t.machine.lift(0.3);
    expect(t.machine.state).toMatchObject({ lift: 0.6 });
    t.machine.lift(5);
    expect(t.machine.state).toMatchObject({ lift: 1 });
    t.machine.liftTo(-2);
    t.machine.liftTo(Number.NaN);
    expect(t.machine.state).toMatchObject({ lift: 0 });
  });

  it('reports crossing into and out of the drop zone, once each way', () => {
    const t = setup({ dropZoneFrom: ZONE });
    t.machine.pickUp('on');
    t.machine.liftTo(0.5);
    t.machine.liftTo(0.85);
    t.machine.liftTo(0.95);
    t.machine.liftTo(0.2);
    const zone = t.notices.filter((n) => n.type === 'zoneChanged');
    expect(zone).toEqual([
      { type: 'zoneChanged', inZone: true },
      { type: 'zoneChanged', inZone: false },
    ]);
  });

  it('drops from the drop zone', () => {
    const t = setup({ dropZoneFrom: ZONE });
    t.machine.pickUp('on');
    t.machine.liftTo(ZONE);
    expect(t.machine.drop()).toBe(0);
    expect(t.spawned).toHaveLength(1);
  });

  it('loses a chip dropped outside the zone: spent, never spawned, never reloaded', () => {
    const t = setup({ dropZoneFrom: ZONE, autoReload: true, stock: { on: 3 } });
    t.machine.pickUp('on');
    t.machine.aim(0.3);
    t.machine.liftTo(0.5);
    expect(t.machine.drop()).toBeUndefined();
    expect(t.spawned).toEqual([]);
    expect(t.notices.at(-1)).toEqual({ type: 'lost', kindId: 'on', x: 0.3, lift: 0.5 });
    expect(t.machine.state.name).toBe('idle');
    expect(t.stock.on).toBe(2);
    expect(t.reserved.on).toBe(0);
  });

  it('lose() drops the chip off the board from anywhere, even the drop zone', () => {
    const t = setup({ dropZoneFrom: ZONE });
    t.machine.pickUp('on');
    t.machine.liftTo(1);
    t.machine.lose();
    expect(types(t).at(-1)).toBe('lost');
    expect(t.spawned).toEqual([]);
    t.machine.lose(); // nothing held: nothing happens
    expect(types(t).filter((type) => type === 'lost')).toHaveLength(1);
  });

  it('reloads at the same spot in the zone, unless the drop asks not to', () => {
    const t = setup({ dropZoneFrom: ZONE, autoReload: true });
    t.machine.pickUp('on');
    t.machine.liftTo(0.9);
    t.machine.drop();
    expect(t.machine.state).toMatchObject({ name: 'holding', lift: 0.9 });
    t.machine.drop({ reload: false });
    expect(t.machine.state.name).toBe('idle');
  });

  it('carryUp drops from the zone without announcing the trip', () => {
    const t = setup({ dropZoneFrom: ZONE });
    t.machine.pickUp('on');
    expect(t.machine.drop({ carryUp: true })).toBe(0);
    expect(types(t)).toEqual(['pickedUp', 'dropped']);
  });

  it('a new pickup starts in the tray again', () => {
    const t = setup({ dropZoneFrom: ZONE });
    t.machine.pickUp('on');
    t.machine.liftTo(1);
    t.machine.drop();
    t.machine.pickUp('on');
    expect(t.machine.state).toMatchObject({ lift: 0 });
  });
});
