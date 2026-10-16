---
description: Review a plinko-config pull request as an independent reviewer and post the findings as PR comments
argument-hint: <pr-number>
---

You're reviewing pull request #$ARGUMENTS on plinko-config as an independent reviewer. Another Claude session wrote it. Review it with fresh eyes, and don't assume the author's checks were complete.

## Setup

1. `gh pr view $ARGUMENTS` and `gh pr diff $ARGUMENTS`. Read the issue the PR closes (`gh issue view <n>`).
2. Read `CLAUDE.md` and `CONTRIBUTING.md`. Their standards are the review criteria.
3. Another session may be working in this checkout, so don't switch branches here. Review in a separate worktree:
   ```
   git fetch origin
   git worktree add ../plinko-review-$ARGUMENTS origin/<head-branch>
   ```
   In the worktree, run `npm ci`, and `npm ci` in `site/` too (`npm run docs:examples` needs it).
   When you're done, remove it with `git worktree remove --force ../plinko-review-$ARGUMENTS`.

## Follow-up mode

If the PR already has a review whose body starts with `🤖 Claude review:`, this is a follow-up round:

- For each earlier finding, read the author's reply and the commit it names. Check that the fix works and that it has a test where one applies (see "Definition of done" below).
- Review only the commits after that review (`git log <reviewed-sha>..`). Don't repeat earlier findings that were fixed.

## What to check

1. **Does it do what the issue asks?** Check each point and each out-of-scope item. Check that the claims in the PR description are true.
2. **Correctness.** Look for state that goes stale or wrong across rebuilds, resets, pauses, destroy, and rapid changes. Look for edge cases: empty, zero, infinite, removed items.
3. **Project rules** (CLAUDE.md, CONTRIBUTING.md and the maintainer's preferences):
   - The docs site and debug pages use the public `plinko-config` API only.
   - `src/core/` stays pure (no DOM, timers, or `Math.random` outside `randomSeed()`).
   - Public API changes have doc comments, and `npm run docs:build` passes.
   - Physics changes come with an `npm run sim` before/after comparison.
   - American spelling in docs, comments and UI text. API names like `cancelled` stay as they are.
   - WCAG is cited as "WCAG 2.2 SC 1.4.4", never as a bare "1.4.4".
   - Code reads like the surrounding code: same naming, comment density and idioms.
4. **Tests must be able to fail.** For each new or changed test, break the code it covers in the worktree (revert the fix, or violate the invariant) and confirm the test goes red. A test that stays green is a finding. `npm run mutate` (Stryker) can help with core logic, but it's slow, so scope it.
5. **Accessibility** of any UI change: semantics, keyboard, and what a screen reader would announce.
6. **Verify, don't guess.** Run `npm run check`, plus `npm run docs:examples` for site changes and `npm run test:e2e` for `src/runtime/` changes. Mark each finding as **confirmed** (reproduced, or traced in the code) or **suspected**.

## Definition of done

Say in the summary whether the PR meets each of these:

- CI is green (`gh pr checks $ARGUMENTS`).
- Every finding from earlier rounds is answered.
- Where a test applies, tests assert the success case and the invariants that must hold, and they fail when the code they cover is broken.

The maintainer's approval is the last step, and you can't give it.

## Posting the review

Post a single review with inline comments:

```
gh api repos/{owner}/{repo}/pulls/$ARGUMENTS/reviews --method POST --input review.json
```

```json
{
  "event": "COMMENT",
  "body": "<summary>",
  "comments": [
    { "path": "path/to/file.ts", "line": 42, "side": "RIGHT", "body": "<finding>" }
  ]
}
```

- `event` must be `COMMENT`. The PR author is the same GitHub account, so APPROVE and REQUEST_CHANGES fail.
- Start every comment body with `🤖 Claude review:`, because the comments post under the maintainer's account.
- Tag each finding **[blocking]**, **[should fix]** or **[nit]**, and add confirmed or suspected.
- For each finding, say what's wrong, give a way to reproduce it (steps, a command, or a test that fails), and suggest a fix.
- Report at most 8 findings, the most important first. Leave out style points that Biome already enforces.
- Write `review.json` outside the repo (for example in the system temp directory) so it isn't left in a checkout.
- Summary body: a verdict (ready to merge / merge after fixes / needs rework), the definition-of-done status, the commands you ran with their results, and anything you couldn't verify.

Don't push commits, edit the branch, or merge. When you're done, tell the user the review URL and the verdict in two or three lines.
