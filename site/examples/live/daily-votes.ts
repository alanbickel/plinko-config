// Live example: daily votes. Three votes to spend; asking for more gets one yes, then a no.

interface Votes {
  left: number;
  tally: Record<string, number>;
  /** The moderator's latest answer, if any. */
  note: string;
}

/** The result panel: votes left, the tally so far, and the moderator's answer. */
function render(output: HTMLElement, { left, tally, note }: Votes): void {
  const counts = Object.entries(tally).map(([feature, n]) => `${feature}: ${n}`);
  output.textContent = [`Votes left: ${left}`, ...counts, note].filter(Boolean).join(' · ');
}

// #region board
import { createPlinko, type RequestAnswer } from 'plinko-config';

export function mount(target: HTMLElement, output: HTMLElement) {
  const votes: Votes = { left: 3, tally: {}, note: '' };
  let requests = 0;

  return createPlinko(target, {
    slots: [
      { id: 'offline', label: 'Offline mode' },
      { id: 'export', label: 'Export to CSV' },
      { id: 'shortcuts', label: 'Shortcuts' },
    ],
    chips: [{ id: 'vote', label: 'Vote', count: 3 }],
    board: { rows: 4, slotHeight: 1.5 },
    // After a keyboard drop, pick up the next chip by hand.
    autoReload: false,
    supply: { refill: { mode: 'onRequest' } },
    onLand: ({ slot }) => {
      votes.tally[slot.label] = (votes.tally[slot.label] ?? 0) + 1;
      render(output, votes);
    },
    onSupplyChange: ({ counts }) => {
      votes.left = counts.vote ?? 0;
      render(output, votes);
    },
    // Out of votes, the tray offers more. A pretend moderator says yes once.
    onRequest: async (): Promise<RequestAnswer> => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      requests += 1;
      const yes = requests === 1;
      votes.note = yes ? 'Moderator: yes.' : 'Moderator: no more today.';
      render(output, votes);
      return yes ? 'grant' : 'deny';
    },
  });
}
// #endregion board
