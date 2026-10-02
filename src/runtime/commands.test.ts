import { describe, expect, it } from 'vitest';
import { CommandMachine, type CommandPorts, type Notice } from './commands';

interface SetupInput {
  maxInFlight?: number;
  autoReload?: boolean;
  /** Chips available per kind; unlimited when not given. */
  stock?: Record<string, number>;
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

const ready = (t: Harness): Harness => {
  t.machine.ready();
  t.notices.length = 0;
  return t;
};

describe('CommandMachine', () => {
  it('starts loading and ignores commands until ready', () => {
    const t = setup();
    expect(t.machine.state.name).toBe('loading');
    expect(t.machine.pickUp('on')).toBe(false);
    t.machine.ready();
    expect(t.machine.state.name).toBe('idle');
    expect(t.notices).toEqual([{ type: 'ready' }]);
  });

  it('picks up, aims, and drops', () => {
    const t = ready(setup());
    expect(t.machine.pickUp('on')).toBe(true);
    expect(t.machine.state).toEqual({ name: 'holding', kindId: 'on', x: 0.5 });
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
    const t = ready(setup());
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
    const t = ready(setup());
    t.machine.pickUp('on');
    t.machine.aim(0.2);
    t.machine.drop();
    t.machine.pickUp('off');
    expect(t.machine.state).toEqual({ name: 'holding', kindId: 'off', x: 0.2 });
    expect(t.machine.lastKind).toBe('off');
  });

  it('cancel returns the chip to the tray', () => {
    const t = ready(setup({ stock: { on: 1 } }));
    t.machine.pickUp('on');
    expect(t.stock.on).toBe(0);
    t.machine.cancel();
    expect(t.stock.on).toBe(1);
    expect(t.machine.state.name).toBe('idle');
    expect(t.notices.at(-1)).toEqual({ type: 'cancelled', kindId: 'on' });
  });

  it('reports out of chips and stays idle', () => {
    const t = ready(setup({ stock: { on: 0 } }));
    expect(t.machine.pickUp('on')).toBe(false);
    expect(t.machine.state.name).toBe('idle');
    expect(t.notices).toEqual([{ type: 'outOfChips', kindId: 'on' }]);
  });

  it('rejects unknown kinds', () => {
    const t = ready(setup());
    expect(t.machine.pickUp('nope')).toBe(false);
    expect(t.notices).toEqual([]);
  });

  it('switching kinds while holding releases the first', () => {
    const t = ready(setup({ stock: { on: 1, off: 1 } }));
    t.machine.pickUp('on');
    expect(t.machine.pickUp('off')).toBe(true);
    expect(t.stock).toMatchObject({ on: 1, off: 0 });
    expect(t.machine.pickUp('off')).toBe(true); // same kind: no-op
    expect(t.stock.off).toBe(0);
  });

  it('auto-reloads the same kind at the same x', () => {
    const t = ready(setup({ autoReload: true, stock: { on: 2 } }));
    t.machine.pickUp('on');
    t.machine.aim(0.3);
    t.machine.drop();
    expect(t.machine.state).toEqual({ name: 'holding', kindId: 'on', x: 0.3 });
    expect(t.notices.at(-1)).toMatchObject({ type: 'dropped', reloaded: true });

    t.machine.drop();
    expect(t.machine.state.name).toBe('idle');
    expect(t.notices.slice(-2)).toEqual([
      { type: 'dropped', kindId: 'on', x: 0.3, dropId: 1, reloaded: false },
      { type: 'outOfChips', kindId: 'on' },
    ]);
  });

  it('waits when maxInFlight is reached', () => {
    const t = ready(setup({ maxInFlight: 2 }));
    t.machine.pickUp('on');
    t.setFlying(2);
    expect(t.machine.drop()).toBeUndefined();
    expect(t.machine.state.name).toBe('holding');
    expect(t.notices.at(-1)).toEqual({ type: 'busy' });
    t.setFlying(1);
    expect(t.machine.drop()).toBe(0);
  });

  it('lock returns a held chip to the tray and refuses everything after', () => {
    const t = ready(setup({ stock: { on: 1 } }));
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
    const t = ready(setup());
    t.machine.lock();
    expect(t.notices).toEqual([{ type: 'locked', returnedKindId: undefined }]);
  });

  it('destroy releases a held chip, once', () => {
    const t = ready(setup({ stock: { on: 1 } }));
    t.machine.pickUp('on');
    t.machine.destroy();
    t.machine.destroy();
    expect(t.stock.on).toBe(1);
    expect(t.machine.state.name).toBe('destroyed');
    expect(t.notices.filter((n) => n.type === 'destroyed')).toHaveLength(1);
    expect(t.machine.pickUp('on')).toBe(false);
  });
});
