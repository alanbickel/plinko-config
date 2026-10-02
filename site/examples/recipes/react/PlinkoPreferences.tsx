// #region component
import { createPlinko, type LandDetails, type PlinkoBoard } from 'plinko-config';
import { useEffect, useRef } from 'react';

type Channel = 'email' | 'push' | 'sms';

interface Props {
  onChange: (channel: Channel, enabled: boolean) => void;
}

export function PlinkoPreferences({ onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const board = useRef<PlinkoBoard<boolean, Channel>>(undefined);

  // Mount once; destroy on unmount.
  useEffect(() => {
    if (!host.current) return;
    board.current = createPlinko<boolean, Channel>(host.current, {
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
    return () => board.current?.destroy();
  }, []);

  // Fresh callbacks go to the live board; slots and chips stay put, and so do the piles.
  useEffect(() => {
    board.current?.update({
      onLand: ({ chip, slot }: LandDetails<boolean, Channel>) => {
        if (chip.value !== undefined && slot.value) onChange(slot.value, chip.value);
      },
    });
  }, [onChange]);

  return <div ref={host} />;
}
// #endregion component
