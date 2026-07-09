# Loop Bounds

The loop terminates either when the predicate passes or when a bound
trips. Bounds exist so the failure mode is legible — a loop that
"almost works for ages" is worse than one that fails fast.

## Bounds table

Every bound is named with its unit so the value's meaning is
unambiguous (seconds, tokens, iterations) and so the config-file keys
match the table 1:1.

| Bound | Default | Behavior at bound |
|---|---|---|
| `MAX_ITERATIONS` | **10** (hard cap **20**, project-configurable) | Hard stop. Emit "loop exhausted at iteration N." Fire Phase 4 dispatch. Ask user. |
| `MAX_WALL_CLOCK_SECONDS` | **3600** (60 min) | Hard stop, same exit shape. |
| `NO_PROGRESS_LIMIT_ITERATIONS` | **2 consecutive iterations** with zero new VALID signals AND no `mergeStateStatus` change | Pause and ask user. We're stuck — the same input is producing the same output. |
| `CODERABBIT_INITIAL_WAIT_SECONDS` | **900** (15 min) on Phase 1 with no CodeRabbit auto-review landed | Pause and ask user. Diagnostic: verify repo enrollment / draft status / fork status. |
| `BOT_SILENT_TIMEOUT_SECONDS` | **720** (12 min) after a push with no new bot comment | Pause and ask user. Matches `augment-review`'s Phase 2 polling default. |
| `COST_CAP_TOKENS` | Unset by default; per-project override | Pause when approached (90% of cap). Surface remaining budget. User decides to continue or stop. |
| `SLOW_CONVERGENCE_WARN_AT_ITER` | **7** | Emit warning line only. Does not change loop behavior. |

## Why these defaults

`MAX_ITERATIONS = 10` matches the observed upper end of "real" PR
review cycles in the org (occasionally 5+, rarely above 10). The hard
cap at 20 protects against pathological cases where iterations 11–20
would still be making progress.

`MAX_WALL_CLOCK_SECONDS = 3600` (60 min) is the upper end of a
focused session. Beyond that, the user almost certainly wants to
abandon the loop and either rethink the PR or merge by hand.

`NO_PROGRESS_LIMIT_ITERATIONS = 2` is tight on purpose. The same predicate state
twice in a row, with no new VALID signals, means the loop is spinning
— either the bots are repeatedly suggesting the same thing (likely a
convention-gap retro signal that needs human resolution) or the fixes
aren't landing (likely a CI / branch protection issue).

`CODERABBIT_INITIAL_WAIT_SECONDS = 900` (15 min) is the Phase 1 wait
for CodeRabbit's auto-review on PR open. It is intentionally longer
than `BOT_SILENT_TIMEOUT_SECONDS` because the cold-start review window
in the medine-tech org is ~5 min, and CodeRabbit can rate-limit during
PR open (see ADR 0013) — the extra buffer absorbs both. Persistent
silence at 15 min almost always means repo non-enrollment, draft status,
or a fork PR.

`BOT_SILENT_TIMEOUT_SECONDS = 720` (12 min) matches the existing
`augment-review` Phase 2 polling default. Beyond 12 minutes after a
push, the bot is either down or has decided there's nothing to review;
the user should choose whether to keep waiting. Applies to CodeRabbit's
auto-rereview after iteration pushes (Augment is not waited on
per-iteration; see SKILL.md).

`SLOW_CONVERGENCE_WARN_AT_ITER = 7` is the diagnostic threshold: by
iter 7, a healthy PR loop has converged or escalated. Crossing it
without converging is itself the signal — "this PR is diagnosing your
`AGENTS.md`, not just your code."

## Configuring per project

Bounds live in `.pr-merge-loop/config.json` at the project root (optional).
Read on entry, override only the keys present:

```json
{
  "MAX_ITERATIONS": 15,
  "MAX_WALL_CLOCK_SECONDS": 5400,
  "CODERABBIT_INITIAL_WAIT_SECONDS": 1200,
  "COST_CAP_TOKENS": 500000
}
```

Config keys match the bounds table 1:1. Keys not present use the
defaults above; unknown keys are ignored with a warning.

## Bound trip surfaces

When a bound trips, surface:

1. Which bound and its value
2. The current predicate state field-by-field (which conditions pass, which fail)
3. The slow-convergence diagnosis if applicable ("4 of last 5 iterations had `convention-gap` retros on the same file — likely missing rule in `AGENTS.md#X`")
4. The next-action options for the user: continue with raised bound, abort, escalate to human reviewer

Always fire Phase 4 dispatch before returning control to the user, even
on bound trip. The signal is most valuable when the loop fails.
