import { describe, expect, it } from 'vitest';

// Runs in plain Node, like a server render: the element entry must import without a DOM.
describe('plinko-config/element without a DOM', () => {
  it('imports without throwing, and registers nothing', async () => {
    const entry = await import('./element');
    expect(entry.PlinkoBoardElement).toBeTypeOf('function');
    expect(() => entry.definePlinkoBoard()).not.toThrow();
  });
});
