---
name: augment-review
description: >-
  Trigger an AI code review on a GitHub PR and evaluate each suggestion with
  senior developer judgment. Use when the user wants to review a PR with Augment,
  process bot review comments, evaluate AI reviewer suggestions, or pastes a
  GitHub PR URL expecting a review workflow. Also triggers on "review this PR",
  "run augment on this", "process bot comments", "evaluate the review".
license: MIT
metadata:
  author: medine-tech
  version: "1.0.0"
---

# Augment Review — AI Code Review Evaluator

You are a **Senior Software Developer** evaluating AI code review suggestions on a GitHub PR. Your goal: validate each suggestion, react positively to valid ones, respectfully decline incorrect ones, fix valid issues, and ensure all quality checks pass.

**Input:** `$ARGUMENTS` — a GitHub PR URL or `owner/repo#number`

---

## Project Conventions

Before applying this skill, read the project's root `AGENTS.md` and any
`docs/*.md` files it indexes that are relevant to this task. Project-specific
conventions override this skill's generic defaults; when they conflict,
the project wins and the skill records the override in the output.

---

## Phase 0: Parse Input and Sync Precondition

Make sure the local working copy and the PR branch are coherent with their
remotes *before* triggering the bot in Phase 1. A stale branch produces
stale suggestions and a stale push.

This phase runs *first*, so it owns the input parse — the sync checks
need `$PR_NUMBER` and `$PR_HEAD_BRANCH` derived from `$ARGUMENTS`, and the
trigger comment in Phase 1 also reuses them.

### Step 1 — Parse `$ARGUMENTS`

Extract `OWNER`, `REPO`, `PR_NUMBER` from the input. Supported formats:

- `https://github.com/owner/repo/pull/123`
- `owner/repo#123`

Then derive `PR_HEAD_BRANCH` from the PR itself:

```bash
PR_HEAD_BRANCH=$(gh pr view "$PR_NUMBER" --json headRefName --jq .headRefName)
```

### Step 2 — Sync checks

Read `references/sync-precondition.md` for the full protocol. The short
form:

1. **Right branch checked out** — `git rev-parse --abbrev-ref HEAD` must
   match `$PR_HEAD_BRANCH`. Never auto-switch; the user might have staged
   work elsewhere.
2. **No uncommitted changes** — `git status --porcelain` must be empty.
   Never stash silently; the user could lose work.
3. **Local ≡ `origin/$PR_HEAD_BRANCH`** — if behind, `git pull --rebase`.
   If diverged (commits both sides), abort and ask: a collaborator may
   have force-pushed.
4. **PR not behind base** — `gh pr view "$PR_NUMBER" --json mergeStateStatus`;
   if the result is `BEHIND`, rebase onto the base branch and push with
   `--force-with-lease` (never `--force`).

If any check escalates to "ask the user," stop and surface the state.
Per ADR 0011, this skill stays single-shot; loop-until-mergeable
orchestration lives in `pr-merge-loop` and that orchestrator re-runs this
precondition at the start of every iteration.

---

## Phase 1: Trigger Augment Review

Reuses `OWNER`, `REPO`, `PR_NUMBER` from Phase 0.

1. **Post the trigger comment:**
   ```bash
   gh pr comment $PR_NUMBER --body "@augment review"
   ```

   The `@`-mention form is the canonical trigger — empirically verified on
   `medine-tech/flexio` PR 6376 where it produced Augment's PR Summary at
   T+4 min.

2. **Record the trigger timestamp** — store the current UTC time for filtering comments.

3. **Notify the user:**
   > Augment review triggered. Polling for review comments (timeout: 12 min, checking every 4 min)...

---

## Phase 2: Poll for Bot Comments

**Goal:** Wait for AI review bots to post their comments.

### Polling loop

```
max_iterations = 3
wait_seconds = 240  (4 minutes)

for iteration in 1..max_iterations:
    sleep 240
    fetch bot comments (see references/bot-detection.md)
    if bot comments found after trigger timestamp:
        break

if no comments found:
    notify user: "Timeout (12 min). No bot review comments found."
    exit
```

### Bot detection

Read `references/bot-detection.md` for:
- Generic bot detection via `user.type == "Bot"` or login ending in `[bot]`
- jq filters for both issue comments and PR review comments
- Filtering by trigger timestamp
- Grouping comments by bot login
- Known bot-specific handling (augmentcode, coderabbitai, codex)

### After detection

1. Collect all bot comments grouped by bot
2. For augmentcode: react to the PR Summary comment (read `references/bot-detection.md` for details)

---

## Phase 3: Senior Developer Analysis

**Goal:** Evaluate each bot suggestion with senior developer judgment.

Read `references/analysis-protocol.md` for the full classification protocol,
including the retrospective taxonomy that VALID suggestions carry into Phase 5.

For **each comment**:

1. **Read context** — open affected file(s), check CLAUDE.md / AGENTS.md for conventions
2. **Classify** as VALID or INVALID using the criteria in the analysis protocol
3. **For VALID suggestions, attach a retrospective tag** — choose one
   category from the taxonomy in `references/analysis-protocol.md` and
   write one grounded sentence stating what the implementing agent likely
   lacked (cite the file/line or `AGENTS.md` section you read to ground
   it; don't speculate). This is a Chesterton's-Fence check: if you can't
   say *why* the original code didn't consider the suggestion, you don't
   yet understand the fix you're about to push.
4. **Track** classification with comment ID, bot login, file path, reason,
   retro category, and retro line. The retro pack is consumed by
   `pr-merge-loop` for its end-of-loop self-improvement dispatch when this
   skill runs inside that orchestrator (per ADR 0011).

---

## Phase 4: React and Reply

**Goal:** Provide feedback on each comment via reactions and replies.

Read `references/reactions-and-replies.md` for:
- API endpoints for reactions (issue comments vs. review comments)
- API endpoints for replies (inline thread vs. issue-level)
- Reply templates for INVALID (respectful decline)
- Tone rules

### Actions per classification

| Classification | Reaction | Reply |
|----------------|----------|-------|
| VALID | `+1` | None yet (fix first) |
| INVALID | `-1` | Respectful decline with reason |

---

## Phase 5: Fix Valid Suggestions

**Goal:** Apply fixes for all VALID suggestions, then verify with quality checks.

1. **Re-read the retro line attached in Phase 3** — if the grounded
   "why the agent missed this" no longer holds up under a second look
   (e.g. you discover the fix would break an invariant the bot didn't
   see), downgrade the suggestion to INVALID and skip the fix. This
   sanity check is cheap and catches the cases where the initial
   classification was right *about the suggestion's accuracy* but
   wrong *about whether applying it is safe*.

   **When you downgrade, update the classification pack in place** —
   set `classification` to INVALID, set `retro_tag` to
   `false-positive-on-retro`, and replace the retro line with the
   reason the downgrade happened. Then run Phase 4 for the downgraded
   item (swap the `+1` reaction for a `-1` and post the respectful
   decline reply) before moving on. If this skill runs inside
   `pr-merge-loop`, the orchestrator's state file
   (`.pr-merge-loop/<pr-number>.json`, see `pr-merge-loop/references/idempotency.md`)
   reads the updated pack on its next iteration, so leaving the
   original VALID in place would re-attempt the same fix.
2. **Fix each VALID suggestion** — edit the affected files
3. **Run quality gate** — read `references/quality-gate.md` for:
   - Detecting available make targets and frontend test scripts
   - Execution order (fail-fast): fix-cs -> check-cs -> static-analysis -> test -> npm test
   - Fix-retry loop: max 3 iterations per failing check
   - Failure parsing hints for PHPStan, ECS, PHPUnit, Behat
   - When to pause and ask the user (after 3 failed retries)
4. **Stage and commit** fixes — include the retro-line context in the
   commit message body when it adds signal (e.g. *"Fix per coderabbit
   suggestion; retro: convention-gap on `Result<T,E>` usage — AGENTS.md
   lacks a rule for error-as-value vs. exceptions"*). Skip the retro
   line in commit bodies for `language-lint` retros since `make fix-cs`
   already handles them.

---

## Phase 5.5: Fix Confirmation

**Goal:** Reply to each VALID comment with the commit hash.

After committing fixes:

```bash
COMMIT_HASH=$(git log -1 --format=%h)
```

For PR review comments (inline):
```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments \
  -f body="Fixed in commit ${COMMIT_HASH}." \
  -F in_reply_to=${comment_id}
```

For issue comments:
```bash
gh pr comment $ARGUMENTS --body "Fixed in commit ${COMMIT_HASH}."
```

Track each fix with its comment ID and commit hash for thread resolution.

---

## Phase 6: Resolve Threads

**Goal:** Mark addressed conversations as resolved.

Read `references/resolve-threads.md` for:
- GraphQL query to get thread node IDs (match by `databaseId`)
- Mutation to resolve threads
- Resolution strategy (resolve VALID+fixed and INVALID+replied threads)
- Pagination note for >100 threads

---

## Phase 7: Summary Report

**Goal:** Present a per-bot breakdown of the review.

### Per-bot table

| Reviewer | Total | Valid | Invalid |
|----------|-------|-------|---------|
| augmentcode[bot] | X | Y | Z |
| coderabbitai[bot] | A | B | C |
| **Total** | **sum** | **sum** | **sum** |

### Per-comment detail

| Bot | Comment | File | Classification | Action |
|-----|---------|------|----------------|--------|
| ... | ... | ... | VALID/INVALID | thumbs up + fixed / thumbs down + reply |

### Notes
- Patterns observed in suggestions
- Quality gate results (pass/fail, retries needed)

---

## Guidelines

### DO
- Read the actual code before judging suggestions
- Provide clear, respectful explanations for rejected suggestions
- Consider project conventions (CLAUDE.md) over generic best practices
- Acknowledge good suggestions even if minor
- Run the full quality gate after applying fixes

### DON'T
- Blindly accept or reject all suggestions
- Be dismissive or rude in reply comments
- Reject suggestions just because they're minor improvements
- Accept suggestions that would break existing functionality
- Skip the quality gate

### Reply Tone
- "This suggestion doesn't apply here because X uses pattern Y as defined in CLAUDE.md"
- NOT: "Wrong. This is not how we do things."

### Documentation/Markdown PRs
Before committing fixes on markdown files, validate:
- Nested list indentation (MD007)
- Unclosed code blocks
- Stale internal references
