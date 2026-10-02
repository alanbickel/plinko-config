// The chip supply at runtime: reports changes to the host, runs interval refills, and handles
// requests for more chips. Counting itself lives in core/supply.ts.

import { type BoardContext, callHost, kindOf, refresh } from './context';
import { lockBoard } from './lock';
import type { ChipDetails, RequestAnswer } from './types';

interface Answered {
  chip: string;
  answer: RequestAnswer;
}

/** After any change to counts: tell the host (if anything changed), lock if exhausted, draw. */
export function supplyChanged(ctx: BoardContext): void {
  reportSupply(ctx);
  if (ctx.supply.isExhausted()) lockBoard(ctx, 'exhausted');
  refresh(ctx);
}

/** Starts interval refills, if the policy has them; returns a function that stops them. */
export function startRefills(ctx: BoardContext): () => void {
  const { refill } = ctx.config;
  if (refill.mode !== 'interval') return () => {};
  const timer = setInterval(() => {
    if (ctx.supply.refillOnce()) supplyChanged(ctx);
  }, refill.everyMs);
  return () => clearInterval(timer);
}

/**
 * Asks the host for more chips of an empty kind. Resolves with the answer; a kind that can't be
 * requested (not empty, wrong policy, board locked) is denied without asking.
 */
export function requestChips(ctx: BoardContext, chip: string): Promise<RequestAnswer> {
  const pending = ctx.requests.get(chip);
  if (pending) return pending;
  if (!isRequestable(ctx, chip)) return Promise.resolve('deny');
  const request = runRequest(ctx, chip);
  ctx.requests.set(chip, request);
  return request;
}

async function runRequest(ctx: BoardContext, chip: string): Promise<RequestAnswer> {
  const details: ChipDetails = { chip: kindOf(ctx, chip) };
  ctx.announcer.say(ctx.config.labels.requesting(details));
  refresh(ctx);
  const answer = await askHost(ctx, details);
  ctx.requests.delete(chip);
  if (ctx.machine.state.name === 'destroyed') return answer;
  ANSWERS[answer](ctx, { chip, answer });
  return answer;
}

/** The host's answer; anything other than 'grant', including a failure, is a denial. */
async function askHost(ctx: BoardContext, details: ChipDetails): Promise<RequestAnswer> {
  const ask = ctx.options.onRequest;
  if (!ask) return 'grant';
  try {
    return (await ask(details)) === 'grant' ? 'grant' : 'deny';
  } catch (err) {
    console.error('plinko-config: onRequest failed; treating it as denied', err);
    return 'deny';
  }
}

const ANSWERS: Record<RequestAnswer, (ctx: BoardContext, answered: Answered) => void> = {
  grant: (ctx, { chip }) => {
    ctx.supply.grant(chip);
    ctx.announcer.say(ctx.config.labels.granted({ chip: kindOf(ctx, chip) }));
    supplyChanged(ctx);
  },
  deny: (ctx, { chip }) => {
    ctx.announcer.say(ctx.config.labels.denied({ chip: kindOf(ctx, chip) }));
    refresh(ctx);
  },
};

function isRequestable(ctx: BoardContext, chip: string): boolean {
  const open = ctx.machine.state.name === 'idle' || ctx.machine.state.name === 'holding';
  return open && ctx.supply.canRequest(chip);
}

/** onSupplyChange, only when the counts actually changed since the last report. */
function reportSupply(ctx: BoardContext): void {
  const snapshot = ctx.supply.snapshot();
  const key = JSON.stringify(snapshot);
  if (key === ctx.ui.lastSupplyReport) return;
  ctx.ui.lastSupplyReport = key;
  callHost(ctx.options.onSupplyChange, snapshot);
}

/** After a drop: the last chip of a kind is gone. */
export function reportIfExhausted(ctx: BoardContext, chip: string): void {
  if (ctx.supply.count(chip) === 0) callHost(ctx.options.onExhausted, { chip: kindOf(ctx, chip) });
}
