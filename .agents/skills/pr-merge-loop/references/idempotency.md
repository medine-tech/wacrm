# Idempotency and Resumability

The loop persists state every iteration so an interrupted run can
resume without re-spending tokens on already-classified comments or
re-running already-applied fixes.

## State file

Path: `.pr-merge-loop/<pr-number>.json` (project-relative,
gitignored). Add `.pr-merge-loop/` to the project `.gitignore` on
first run if absent.

Shape:

```json
{
  "pr_number": 123,
  "started_at": "2026-05-23T10:14:02Z",
  "iterations": [
    {
      "iter": 0,
      "head_sha": "abc1234",
      "started_at": "...",
      "predicate_state": {
        "open": true,
        "mergeStateStatus": "BEHIND",
        "ci_failing": [],
        "open_threads": 4
      },
      "classifications": [
        {
          "comment_id": 9001,
          "bot": "coderabbitai[bot]",
          "file": "src/billing/InvoiceService.ts",
          "line": 42,
          "classification": "VALID",
          "retro_tag": "convention-gap",
          "retro_line": "AGENTS.md has no rule on Result<T,E> vs throw"
        }
      ],
      "fixes": [{"commit_hash": "def567", "comment_ids": [9001]}],
      "action": "rebase"
    }
  ],
  "dispatches": [],
  "ended_at": null,
  "exit_reason": null
}
```

## Resume protocol

On entry, check for an existing state file matching the PR number:

1. **File absent** — fresh run; create the state file after Phase 1.
2. **File present, `ended_at` set** — previous run finished. Ask the
   user: "Previous run ended at <timestamp> with reason <exit_reason>.
   Start fresh, or inspect?" Default to fresh on new invocations to
   the same PR more than 24h after `ended_at`.
3. **File present, `ended_at` null** — interrupted run. Resume:
   - Skip Phase 1's Augment trigger — Augment already reviewed once and is
     one-shot per loop run. CodeRabbit also already auto-reviewed; the
     resume just refetches its existing comments rather than waiting on
     a new auto-review.
   - Reuse all classifications, fixes, and retro tags from prior
     iterations
   - Re-run the sync precondition (state may have changed during the
     interruption)
   - Re-evaluate the predicate from current GitHub state, not from
     the saved `predicate_state`
   - Continue from the iteration where `ended_at` was unset

## What not to cache

- **Current PR state** (`mergeStateStatus`, open threads, CI status) —
  fetch fresh every iteration; the cached value is stale.
- **The retro classification for a comment that was modified** — if
  the comment body changed since classification, re-classify.
- **Fix commits** — they're already in `git log`; don't infer fix
  status from the state file, infer it from the commit history.

The state file is a **decision log**, not a cache of remote state.

## Classification revision protocol

A VALID classification can flip to INVALID after the Phase 5 retro
re-read in `augment-review` (when the second look reveals the fix
would break an invariant the bot didn't see). When this happens, the
underlying skill rewrites its own pack entry in place — classification
becomes INVALID, retro_tag becomes `false-positive-on-retro`, retro
line becomes the downgrade reason — and the loop reads the updated
entry on the next iteration. Don't re-attempt downgraded items; the
state file is authoritative for "what we already decided about this
comment."


## Cleanup

On `ended_at` set + 7 days elapsed, the state file can be deleted.
The loop doesn't auto-clean; the project can `find .pr-merge-loop -mtime +7 -delete`
in its housekeeping.
