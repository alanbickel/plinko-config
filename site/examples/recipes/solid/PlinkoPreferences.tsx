// #region component
import { createPlinko, type PlinkoBoard } from 'plinko-config';
import { createEffect, onCleanup, onMount } from 'solid-js';

type Channel = 'email' | 'push' | 'sms';

interface Props {
  onChange: (channel: Channel, enabled: boolean) => void;
  /** Read aloud as the board's name. */
  title: string;
}

export function PlinkoPreferences(props: Props) {
  let host!: HTMLDivElement;
  let board: PlinkoBoard<boolean, Channel> | undefined;

  onMount(() => {
    board = createPlinko<boolean, Channel>(host, {
      slots: [
        { id: 'email', label: 'Email', value: 'email' },
        { id: 'push', label: 'Push', value: 'push' },
        { id: 'sms', label: 'SMS', value: 'sms' },
      ],
      chips: [
        { id: 'on', label: 'On', value: true },
        { id: 'off', label: 'Off', value: false },
      ],
    });
    onCleanup(() => board?.destroy());
  });

  // Reactive props go to the live board with update(); the piles stay.
  createEffect(() => {
    const { onChange, title } = props;
    board?.update({
      labels: { board: title },
      onLand: ({ chip, slot }) => {
        if (chip.value !== undefined && slot.value) onChange(slot.value, chip.value);
      },
    });
  });

  return <div ref={host} />;
}
// #endregion component
