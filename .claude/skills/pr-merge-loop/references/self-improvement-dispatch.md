# Self-Improvement Dispatch

At loop end (success or failure), aggregate retro signals from all
iterations and offer to forward each cluster to the doc-curation skill
that owns it. The orchestrator never edits docs directly — receiving
skills apply their own rule-of-three / quality gates.

## Why dispatch even on failure

A loop that hits `MAX_ITERATIONS` without converging is exactly the
case where doc gaps are most likely. Skipping dispatch on failure
loses the signal that justifies building the dispatch in the first
place.

## Retro tag → skill routing

The retro taxonomy is defined in
[`../../augment-review/references/analysis-protocol.md`](../../augment-review/references/analysis-protocol.md).
Routing:

| Tag | Dispatch target | Why |
|---|---|---|
| `convention-gap` | `agent-md-creator` (default) or `create-doc` (when the rule needs more than a one-liner) | The implementing agent had no signal; doc the missing rule. |
| `convention-drift` | `agent-md-creator` (tighten existing rule) or `create-doc` (clarify pattern) | Rule exists but didn't bite; sharpen or example. |
| `glossary-gap` | `ubiquitous-language` | Bounded-context glossary lives in `PRODUCT.md`. |
| `test-gap` | Log as TODO + optional `triage-issue` to file a Linear ticket | Not a doc fix; a test backlog item. |
| `external-context-miss` | Log only | Outside-the-repo context; rarely actionable at the project level. |
| `language-lint` | No dispatch | `make fix-cs` already handles. |
| `false-positive-on-retro` | Log only (analytics) | Useful for measuring retro quality over time. |

## Aggregation shape

Within a single loop run, the same retro tag can fire multiple times.
Aggregate by `(tag, source-area)` where source-area is the affected
file's containing module/directory:

```text
convention-gap × src/billing/      (3 hits)
  - InvoiceService.ts:42 — "AGENTS.md has no rule on Result<T,E> vs throw"
  - RefundCommand.ts:18 — "...same issue, idempotency boundary not specified"
  - WebhookHandler.ts:7 — "...same issue, callback error propagation"
glossary-gap × src/billing/        (1 hit)
  - InvoiceService.ts:42 — "Submitter vs Creator not in PRODUCT.md#billing"
test-gap × src/auth/               (2 hits)
  - SessionService.ts — "empty-array branch untested"
  - TokenRefresh.ts — "expired-refresh branch untested"
```

When a `(tag, source-area)` pair has 2+ hits in a single loop, it's
near-certain to be a real gap, not a one-off. Surface the count
prominently so the user sees the signal density.

## Dispatch block format

Emit this block at loop end (omit lanes with no candidates):

```text
## Self-Improvement Dispatch

From this loop (N iterations, predicate=<final-state>), these signals
surfaced:

### Convention gaps / drift (→ agent-md-creator or create-doc)
1. 3× convention-gap in src/billing/ — "AGENTS.md has no rule on
   Result<T,E> vs throw" — dispatch to agent-md-creator? (y/n)
2. 1× convention-drift in src/auth/SessionService.ts:42 — "docs/testing.md
   requires clock injection; code calls Date.now() directly" — dispatch
   to agent-md-creator? (y/n)

### Glossary gaps (→ ubiquitous-language)
1. 1× in src/billing/InvoiceService.ts:42 — "Submitter vs Creator not
   in PRODUCT.md#billing" — dispatch to ubiquitous-language? (y/n)

### Test gaps (→ TODO / triage-issue)
1. 2× in src/auth/ — empty-array and expired-refresh branches untested
   — file as Linear ticket via triage-issue? (y/n)

### Diagnostic
- Slow-convergence at iter 7 was driven by repeated convention-gap on
  Result<T,E> usage in src/billing/. Resolving the AGENTS.md gap before
  the next PR in this module should cut review cycles by ~half.

Reply with numbers to dispatch (e.g., "convention 1,2 / glossary 1"),
"all" to dispatch every offered item, or "skip" to record signals
without dispatching.
```

## After confirmation

For each confirmed item, invoke the receiving skill via the Skill tool
with a focused brief: the retro line(s), the affected file(s), the
proposed rule shape, and a note that this came from `pr-merge-loop`
loop signals (so the receiving skill can fold prior runs' signals if
it tracks history).

The receiving skill applies its own gate. A dispatch hit is not a
guarantee of an edit — `agent-md-creator` may decide the existing rule
already covers it, or `create-doc` may redirect to `create-adr` if
the retro reveals a decision worth recording, not a pattern. Trust
the specialist.

## Recording dispatches

After the user responds, log the outcome — which items dispatched to
which skills, which were skipped — into the loop state JSON so a
re-run on the same PR doesn't re-offer the same items.
