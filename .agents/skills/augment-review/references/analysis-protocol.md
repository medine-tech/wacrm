# Analysis Protocol

## Context Gathering

Before evaluating a suggestion:

1. **Read the affected file(s)** — use the Read tool to see surrounding code
2. **Check project conventions** — look for CLAUDE.md and AGENTS.md in the repo root and relevant directories
3. **Understand the PR intent** — what is the PR trying to accomplish? Does the suggestion align?

---

## Classification Criteria

### VALID — Accept the suggestion

A suggestion is VALID when **all** of these apply:
- **Technically correct** — identifies a real issue and the proposed fix is sound
- **In scope** — addresses code modified in this PR, not pre-existing issues
- **Matches conventions** — aligns with project patterns (CLAUDE.md, architecture decisions)
- **Actionable** — provides a clear, valuable improvement

### INVALID — Decline the suggestion

A suggestion is INVALID when **any** of these apply:
- **Technically incorrect** — would introduce a bug or break functionality
- **Pre-existing issue** — flags code not modified in this PR
- **Conflicts with conventions** — violates CLAUDE.md rules or established project patterns
- **False positive** — misunderstands the code context or purpose
- **Over-engineering** — adds unnecessary complexity for minimal benefit
- **Already addressed** — the issue is handled elsewhere in the codebase

---

## Retrospective Analysis (VALID only)

Every VALID suggestion carries a **retro tag** plus a one-line grounded
sentence explaining what the implementing agent likely lacked when the
code was first written. This pair serves two purposes:

1. **Chesterton's-Fence check before applying the fix.** If you can't
   say *why* the original code didn't consider the suggestion, you
   don't yet understand the fix. Forcing the question catches cases
   where the bot is technically right but the surrounding code has an
   invariant the bot didn't see, and applying the "fix" would break it.
2. **Signal for the self-improvement dispatch in `pr-merge-loop`.** The
   taxonomy makes the signal aggregable — without categories, every
   retro is a free-text paragraph and no rollup is possible.

### Categories

| Tag | Meaning |
|---|---|
| `convention-gap` | No `AGENTS.md` / `docs/` rule covers this. Implementing agent had no signal. Routes to `agent-md-creator` or `create-doc`. |
| `convention-drift` | A rule exists but the code didn't follow it (or the rule itself is stale). Routes to `agent-md-creator` to tighten or `create-doc` to clarify. |
| `test-gap` | No test would have caught this. Routes to a follow-up issue (`triage-issue`) or a TODO line — not a doc fix. |
| `glossary-gap` | Term used wrong or inconsistently with the bounded context. Routes to `ubiquitous-language` for `PRODUCT.md`. |
| `external-context-miss` | Needs info outside the change-set (API contract, vendor doc, deployment topology). Usually no doc fix at the project level. |
| `language-lint` | Pure style or formatting. `make fix-cs` territory. No doc gap. |
| `false-positive-on-retro` | The retro step itself downgraded the suggestion from VALID. Rare but valid escape hatch. |

### Grounding rule

The one-line sentence must cite the file/line you actually read, or
the `AGENTS.md` section you confirmed is missing. Don't speculate
about what the original author was thinking — speculation produces
noise that destroys the rollup's signal density. If you can't ground
the sentence, the tag is wrong; reconsider the classification.

### Examples

| Suggestion | Tag | Grounded line |
|---|---|---|
| "Use `Result<T,E>` instead of throwing here" | `convention-gap` | `AGENTS.md` has no rule on error-as-value vs. exceptions; both patterns appear in `src/` |
| "Inject the clock rather than calling `Date.now()`" | `convention-drift` | `docs/testing.md` requires clock injection, but the affected file at `src/billing/InvoiceService.ts:42` calls `Date.now()` directly |
| "Add a test for the empty-array branch" | `test-gap` | `tests/billing/InvoiceServiceTest.ts` covers happy path only; no test exercises the early-return at `:18` |
| "Should be `Submitter` not `Creator` here" | `glossary-gap` | `PRODUCT.md#billing` defines `Submitter` for this role; `Creator` doesn't appear in the glossary |
| "This breaks the new Stripe webhook contract" | `external-context-miss` | The Stripe API change is documented externally; no local doc captures it |
| "Trailing whitespace" | `language-lint` | `make fix-cs` handles |

---

## Special Cases

### Lint / style issues
If the suggestion is about code style (formatting, naming conventions), mark it VALID but defer the fix to the quality gate. The `make fix-cs` and `make check-cs` targets handle these automatically.

### Vague suggestions
If a suggestion says "consider doing X" without a concrete code change, classify as INVALID with reason: "Suggestion is too vague to act on."

### Markdown / documentation PRs
Apply the same criteria but also check for:
- MD007 (nested list indentation)
- Unclosed code blocks
- Stale internal references

### Duplicate suggestions
If multiple bots suggest the same fix, classify the first one as VALID and subsequent duplicates as INVALID with reason: "Already addressed via [bot name]'s suggestion."
