---
layout: page
title: Examples
description: Live plinko-config boards with the code that runs them. Each one drives a small piece of UI from where its chips land.
---

<script setup>
import { mount as themePicker } from './examples/live/theme-picker';
import { mount as dailyVotes } from './examples/live/daily-votes';
import { mount as lunchDecider } from './examples/live/lunch-decider';
</script>

<div class="examples-page vp-doc">

# Examples

Every board on this page is live, and runs the code beside it.

Pick up a chip by dragging, tapping, or with the keyboard, drop it, and watch the result under the board change.

## Theme picker

Three slots and one chip kind. Where the chip lands sets the preview card's theme.

<div class="example-item">
<div>

<ClientOnly>
  <LiveExample :mount="themePicker" placeholder="Theme: not chosen yet" />
</ClientOnly>

</div>
<div>

<<< ./examples/live/theme-picker.ts#board

</div>
</div>

## Daily votes

A limited supply: three votes, counted as they're spent. Run out, and the tray offers to request more. The (pretend) moderator says yes once, then no. `render()` (not shown) writes the votes into the result panel.

<div class="example-item">
<div>

<ClientOnly>
  <LiveExample :mount="dailyVotes" placeholder="Votes left: 3" />
</ClientOnly>

</div>
<div>

<<< ./examples/live/daily-votes.ts#board

</div>
</div>

## Lunch decider

Eight slots with their names on the back walls, and a board quietly rigged toward pizza. Drop chips from different spots and watch the count.

<div class="example-item">
<div>

<ClientOnly>
  <LiveExample :mount="lunchDecider" placeholder="Lunch: undecided" />
</ClientOnly>

</div>
<div>

<<< ./examples/live/lunch-decider.ts#board

</div>
</div>

</div>
