---
name: pr-merge-loop
description: >-
  Drive a GitHub PR from "open for review" to "mergeable and ready to merge" by
  composing `augment-review` with an inline CodeRabbit GitHub-comment fetcher in
  a goal-seeking loop. CodeRabbit auto-reviews on PR open and on every push in
  the medine-tech org; this skill consumes those auto-reviews rather than
  re-triggering CodeRabbit, which would duplicate the review and risk a rate
  limit. Use when the user wants to "merge this PR", "loop until merge", "get
  this PR to green", "auto-fix all bot suggestions", or pastes a PR URL with
  the intent of letting the bots converge on a clean state. Make sure to use
  this skill whenever the user wants iterative review-fix-rereview cycles that
  terminate on a mergeable state — even if they don't say "loop" explicitly.
  Also use when the user asks for a self-healing PR workflow that closes the
  feedback loop on missing conventions.
license: MIT
metadata:
  author: medine-tech
  version: "1.0.0"
---

# PR Merge Loop — Self-Healing Review → Fix → Merge

You are a **Senior Software Developer** orchestrating a goal-seeking loop that
takes a GitHub PR from "open" to "ready to merge." You compose `augment-review`
with an **inline CodeRabbit GitHub-comment fetcher** as building blocks (per
ADRs 0011 and 0013), add the sync precondition, the merge-readiness predicate,
and the bounded iteration with escalations, and close the loop by dispatching
the retrospective signals to the doc-curation skills that own them.

Augment requires an explicit trigger comment, so it gets the `augment-review`
skill. CodeRabbit auto-reviews on PR open + on every push in the medine-tech
org, so it gets an inline fetcher — re-triggering CodeRabbit would duplicate
the review and risk a `Review limit reached` rate limit. See ADR 0013 for
the empirical evidence and the asymmetry decision.

**Input:** `$ARGUMENTS` — a GitHub PR URL or `owner/repo#number`.

---

## Project Conventions

Before applying this skill, read the project's root `AGENTS.md` and any
`docs/*.md` files it indexes that are relevant to this task. Project-specific
conventions override this skill's generic defaults; when they conflict,
the project wins and the skill records the override in the output.

This skill mutates remote state (pushes, comments, thread resolutions,
optionally a merge). When the user invokes it, treat that as authorization
for the actions described here, **not** for inferred extensions.

---

## Phase 0: Sync Precondition

Run the sync protocol from
[`augment-review/references/sync-precondition.md`](../augment-review/references/sync-precondition.md)
before any review activity. The same protocol re-runs at the start of every
iteration in Phase 2 — collaborator pushes mid-loop are caught at the next
boundary instead of being silently overwritten.

If the precondition aborts, stop. The remediation (commit, switch branch,
inspect divergence) needs human context the loop can't supply.

---

## Phase 1: Initial Review Pass

**Augment** — run `augment-review` once. It posts the trigger comment, waits
for Augment's review, classifies, attaches retro tags, and returns a
classification pack (see
[`augment-review/references/analysis-protocol.md`](../augment-review/references/analysis-protocol.md)).
Augment is triggered exactly once per loop run — never re-triggered on
iterations.

**CodeRabbit** — do **not** invoke `coderabbit-review`. CodeRabbit auto-reviews
on PR open in the medine-tech org. Instead:

1. Record `T_PR_OPEN = $(gh pr view "$PR_NUMBER" --json createdAt --jq .createdAt)`.
2. Wait for CodeRabbit's auto-review to land — see
   [`references/external-waits.md`](references/external-waits.md) for the
   rate-limit-guarded wait predicate and the `CODERABBIT_INITIAL_WAIT_SECONDS`
   bound (15 min, longer than the iteration timer to absorb cold start +
   rate-limit recovery).
3. Once the wait exits successfully, fetch CodeRabbit's review comments from
   the three GitHub surfaces (issue comments, inline review comments, PR
   reviews), filter to those with timestamp > `T_PR_OPEN`, and classify them
   using the analysis protocol cited above. The classification produces a
   pack with the same shape as Augment's.

If the wait surfaces a `Review limit reached` comment from CodeRabbit
(see `external-waits.md`), pause and escalate — never auto-retry on a rate
limit; retry is the loop pathology that *caused* the rate limit.

Combine both packs into the **loop state**:

```json
{
  "pr_number": 0,
  "iteration": 0,
  "head_sha": "",
  "classifications": [{"comment_id": 0, "bot": "", "file": "", "classification": "", "retro_tag": "", "retro_line": ""}],
  "fixes": [{"commit_hash": "", "comment_ids": []}],
  "predicate_state": ""
}
```

Persist loop state to `.pr-merge-loop/<pr-number>.json` (gitignored). On
resume after Ctrl-C, the loop reloads this file and skips comments already
classified — see `references/idempotency.md` for the resumability protocol.

---

## Phase 2: The Loop

Repeat until the **merge predicate** is satisfied or a bound trips. Each
iteration follows this shape:

1. **Re-run sync precondition** (Phase 0). Surfaces collaborator pushes.
2. **Evaluate the merge predicate** — read
   [`references/predicate.md`](references/predicate.md) for the AND-of-four
   conditions, short-circuit evaluated cheapest-first.
3. **If predicate satisfied → Phase 4.**
4. **Otherwise, identify which condition failed and apply the matching
   remediation** — see the remediation table in
   [`references/predicate.md`](references/predicate.md):
   - `mergeable_state == "BEHIND"` → rebase onto base + `--force-with-lease`
   - `mergeable_state == "DIRTY"` → **escalate** (conflict); never auto-resolve
   - Required check failing → wait for the new bot comments, then fix as in Phase 1
   - Open review thread → fix locally, reply on the thread with the commit
     hash, resolve. For CodeRabbit threads, the next `git push` re-runs
     CodeRabbit automatically — no skill invocation, no trigger comment.
     For Augment threads, the bot will only re-engage on the original
     trigger; treat the existing thread as authoritative and reply with
     the fix commit.
5. **Wait on external state with `Monitor`** when the remediation is async
   (waiting for CI to re-run, for CodeRabbit's auto-rereview after a push).
   Augment is **not** waited on per-iteration — it ran once at Phase 1 and
   does not auto-rereview on push. Use `Monitor` with an `until` predicate
   so the harness notifies on transition rather than polling — see
   `references/external-waits.md` for patterns, including the
   rate-limit-guarded CodeRabbit predicate.
6. **Increment iteration counter and check bounds** — read
   [`references/loop-bounds.md`](references/loop-bounds.md) for
   `MAX_ITERATIONS`, `MAX_WALL_CLOCK_SECONDS`, `NO_PROGRESS_LIMIT_ITERATIONS`,
   `BOT_SILENT_TIMEOUT_SECONDS`, and the optional `COST_CAP_TOKENS`.
7. **Emit slow-convergence warning at iteration ≥ 7.** A PR that needs 7+
   cycles is itself a signal — usually a missing convention rule or a
   regression cycle. Print one line:

   > Iter 7+: convergence is slow — likely missing convention rule or
   > regression cycle. Self-improvement dispatch will fire at loop end.

   The warning does not change loop behavior; it makes the diagnostic
   legible so a human watching the loop knows what to look at.

### Per-iteration log line

Emit one structured line per iteration, parseable at a glance:

```text
Iter 3/10 | mergeable=BEHIND→rebased | valid=2 invalid=1(lint) | CI=red(phpunit::FooTest) | retry
```

Fields: iteration index, predicate state transition, classification counts,
CI status with failing-check name, action taken.

---

## Phase 3: Failure Modes and Escalations

The loop pauses and asks the user — never auto-resolves — when:

- `mergeable_state == "DIRTY"` (conflicts)
- Local diverged from `origin` (collaborator force-push suspected)
- Uncommitted local changes appear mid-loop
- Required check failing with a signal the bots can't address (infra failure, missing secret)
- **Human reviewer has an unresolved thread** — bot can fix-and-reply but cannot mark the human's thread resolved (privilege boundary). Pause: "Human reviewer X has an open thread on Y. Wait, or abort?" Never auto-poll on humans.
- `BOT_SILENT_TIMEOUT_SECONDS` reached after a push (no bot re-review)
- Any of the bounds in `references/loop-bounds.md` exceeded

Surface the state, the iteration number, the predicate fields, and the
concrete next action. Don't propose alternatives the user didn't ask for;
escalation is a handoff, not a redesign.

---

## Phase 4: Self-Improvement Dispatch

At loop end — **regardless of merge outcome** — aggregate the retro signals
across all iterations and offer to dispatch them to the doc-curation skills
that own them. Read
[`references/self-improvement-dispatch.md`](references/self-improvement-dispatch.md)
for the dispatch block format and the routing table.

Failure-terminated loops produce the most valuable signals (the codebase
didn't anticipate something) — never skip dispatch on failure.

The dispatch is confirm-only: receiving skills (`agent-md-creator`,
`ubiquitous-language`, `create-doc`) apply their own rule-of-three /
quality gates. The orchestrator just hands them the signal pack.

---

## Phase 5: Final Report and Optional Auto-Merge

Emit the final report:

### Iteration table

| Iter | HEAD | Predicate state | New VALID | New INVALID | Action |
|------|------|-----------------|-----------|-------------|--------|
| 0    | abc1 | OPEN/BEHIND/red | 5         | 2           | rebase |
| 1    | def2 | OPEN/CLEAN/red  | 2         | 0           | fix    |
| ...  | ...  | ...             | ...       | ...         | ...    |

### Per-bot table (composed from underlying skill reports)

| Reviewer         | Total | Valid | Invalid |
|------------------|-------|-------|---------|
| augmentcode[bot] | X     | Y     | Z       |
| coderabbitai[bot]| A     | B     | C       |
| **Total**        | sum   | sum   | sum     |

### Self-Improvement Dispatch (Phase 4 output)

### Auto-merge (optional)

If the predicate is satisfied and the user has authorized auto-merge (in
project conventions or by explicit instruction in `$ARGUMENTS`), run:

```bash
gh pr merge $PR_NUMBER --auto --squash
```

`--auto` lets GitHub's own state machine handle the actual merge once
required reviews land. Otherwise, hand off to the user.

---

## Guidelines

### DO
- Compose `augment-review` for Augment; fetch CodeRabbit comments inline (see Phase 1).
- Short-circuit the predicate on the cheapest signal first.
- Always `--force-with-lease`, never `--force`.
- Persist loop state every iteration so Ctrl-C → re-run resumes cleanly.
- Emit one structured log line per iteration.
- Dispatch self-improvement on failure as well as success.

### DON'T
- Post `@coderabbitai full review` (or any CodeRabbit trigger comment).
  CodeRabbit auto-reviews on PR open + every push in the medine-tech org;
  triggering it duplicates the review and risks a `Review limit reached`
  rate limit. See ADR 0013.
- Call `coderabbit-review` from this loop. `coderabbit-review` runs the local
  CLI, which is a *second* review surface parallel to CodeRabbit's GitHub
  auto-review — paying twice, classifying twice. `coderabbit-review` is
  preserved for standalone pre-PR use only.
- Re-trigger Augment after Phase 1. Augment is one-shot per loop run. If
  iter 1+ commits introduce a class of issue Augment would catch but
  CodeRabbit misses, run `/augment-review <PR>` manually after the loop
  ends as the escape hatch — adding a per-iteration Augment trigger has
  the same rate-limit pathology as triggering CodeRabbit.
- Auto-resolve conflicts (`mergeable_state == "DIRTY"`).
- Auto-switch branches when the wrong branch is checked out.
- Auto-stash uncommitted changes.
- Auto-poll on human reviewer threads.
- Mark a thread resolved unless the bot's `+1` reaction and reply already landed.
- Skip the sync precondition between iterations.

### Augment blind-spot trade-off
Augment runs once at iter 0. Iter 1+ rely on CodeRabbit only. This is
deliberate (avoids duplicate triggers and rate-limit cascades) but means a
CodeRabbit-clean PR may still have an Augment-catchable regression introduced
by a later iteration's fix. Mitigation: run `/augment-review <PR>` manually
after the loop ends if you suspect Augment would catch something CodeRabbit
missed. Don't bake a final-iteration Augment sweep into the loop until
real-world evidence shows the regression class is common (rule of three).

### Loop hygiene
The loop terminates. If the predicate isn't satisfiable, a bound trips and
the loop ends with the dispatch block firing anyway. A loop that "almost
works for ages" is worse than a loop that fails fast — the bounds exist to
make the failure mode legible.
