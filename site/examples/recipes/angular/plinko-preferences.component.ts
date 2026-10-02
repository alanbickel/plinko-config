// #region component
import {
  type AfterViewInit,
  Component,
  type ElementRef,
  EventEmitter,
  Input,
  type OnChanges,
  type OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { createPlinko, type PlinkoBoard } from 'plinko-config';

type Channel = 'email' | 'push' | 'sms';

export interface PreferenceChange {
  channel: Channel;
  enabled: boolean;
}

@Component({
  selector: 'app-plinko-preferences',
  standalone: true,
  template: '<div #host></div>',
})
export class PlinkoPreferencesComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Read aloud as the board's name. */
  @Input() title = 'Notification preferences';
  @Output() changed = new EventEmitter<PreferenceChange>();
  @ViewChild('host') private host!: ElementRef<HTMLDivElement>;
  private board: PlinkoBoard<boolean, Channel> | undefined;

  ngAfterViewInit(): void {
    this.board = createPlinko<boolean, Channel>(this.host.nativeElement, {
      slots: [
        { id: 'email', label: 'Email', value: 'email' },
        { id: 'push', label: 'Push', value: 'push' },
        { id: 'sms', label: 'SMS', value: 'sms' },
      ],
      chips: [
        { id: 'on', label: 'On', value: true },
        { id: 'off', label: 'Off', value: false },
      ],
      labels: { board: this.title },
      onLand: ({ chip, slot }) => {
        if (chip.value === undefined || !slot.value) return;
        this.changed.emit({ channel: slot.value, enabled: chip.value });
      },
    });
  }

  // Input changes go to the live board with update(); the piles stay.
  ngOnChanges(): void {
    this.board?.update({ labels: { board: this.title } });
  }

  ngOnDestroy(): void {
    this.board?.destroy();
  }
}
// #endregion component
