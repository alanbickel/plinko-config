// Live example: a lunch decider, quietly rigged toward pizza with physics.bias.

// #region board
import { createPlinko } from 'plinko-config';

export function mount(target: HTMLElement, output: HTMLElement) {
  const picks = new Map<string, number>();
  let lunches = 0;

  return createPlinko(target, {
    slots: [
      { id: 'tacos', label: 'Tacos' },
      { id: 'sushi', label: 'Sushi' },
      { id: 'pizza', label: 'Pizza' },
      { id: 'ramen', label: 'Ramen' },
      { id: 'salad', label: 'Salad' },
      { id: 'burgers', label: 'Burgers' },
      { id: 'curry', label: 'Curry' },
      { id: 'pho', label: 'Pho' },
    ],
    chips: [{ id: 'lunch', label: 'Lunch' }],
    board: { rows: 6 },
    // After a keyboard drop, pick up the next chip by hand.
    autoReload: false,
    // Names on each slot's back wall, so eight fit without slanting.
    slotLabels: { layout: 'backboard' },
    // Rigged: pizza wins about a third of the time, not 1 in 8.
    physics: { bias: { pizza: 8 } },
    onLand: ({ slot }) => {
      lunches += 1;
      picks.set(slot.label, (picks.get(slot.label) ?? 0) + 1);
      const [top, hits] = [...picks].reduce((a, b) => (b[1] > a[1] ? b : a));
      const score = `${top} (${hits} of ${lunches})`;
      output.textContent = `Lunch: ${slot.label}. Top pick: ${score}`;
    },
  });
}
// #endregion board
