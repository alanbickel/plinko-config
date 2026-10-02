import { createPlinko, type RequestAnswer, type SlotConfig } from 'plinko-config';

declare const slots: SlotConfig[];
declare function askManager(chipId: string): Promise<boolean>;

// #region refill
createPlinko('#board', {
  slots,
  chips: [{ id: 'on', label: 'On', count: 3 }],
  supply: { refill: { mode: 'onRequest' } }, // or { mode: 'never' }, or { mode: 'interval', everyMs: 5000 }
  onRequest: async ({ chip }): Promise<RequestAnswer> =>
    (await askManager(chip.id)) ? 'grant' : 'deny',
});
// #endregion refill

// #region persist
const saved = JSON.parse(localStorage.getItem('plinko-supply') ?? '{"counts":{}}');

createPlinko('#board', {
  slots,
  chips: [{ id: 'on', label: 'On', count: saved.counts.on ?? 3 }],
  onSupplyChange: (snapshot) => localStorage.setItem('plinko-supply', JSON.stringify(snapshot)),
});
// #endregion persist
