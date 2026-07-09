# Merge-Readiness Predicate

The loop terminates when this predicate evaluates to true. It is an
AND-of-four, short-circuit evaluated cheapest-to-most-expensive so the
loop never waits on CI when the branch is `BEHIND` or asks CodeRabbit to
re-review a diff that's about to be rebased.

## Conditions

Evaluate in order. Stop at the first failing condition, apply its
remediation, then re-evaluate from the top in the next iteration.

### 1. PR is still open

```bash
STATE=$(gh pr view "$PR_NUMBER" --json state --jq .state)
[[ "$STATE" == "OPEN" ]]
```

If closed or merged, the loop's job is done (or moot). Skip remaining
checks and proceed to Phase 4.

### 2. `mergeable_state == "CLEAN"`

```bash
MERGE_STATE=$(gh pr view "$PR_NUMBER" --json mergeStateStatus --jq .mergeStateStatus)
[[ "$MERGE_STATE" == "CLEAN" ]]
```

GitHub's composite signal. The interesting values and their remediations:

| `mergeStateStatus` | Meaning | Remediation |
|---|---|---|
| `CLEAN` | All required checks pass, no conflicts, no blocks | (predicate passes this gate) |
| `BEHIND` | Base branch advanced; PR needs rebase | Rebase + `--force-with-lease`; re-evaluate |
| `DIRTY` | Conflicts with base | **Escalate**; never auto-resolve |
| `BLOCKED` | Required review or check missing | Read the missing element and route — required check → wait/fix; required review → escalate |
| `UNSTABLE` | Non-required checks failing, mergeable | Treat as failed predicate; inspect failing check |
| `UNKNOWN` | GitHub still computing | Wait briefly (10–15s) and re-evaluate; never block on this |
| `HAS_HOOKS` | Pre-receive hook failure | Escalate (project-specific) |

### 3. All required CI checks `success`

Even though `CLEAN` implies it, assert explicitly so the failure is
legible if branch protection is misconfigured:

```bash
gh pr checks "$PR_NUMBER" --required --json state \
  --jq '[.[] | select(.state != "SUCCESS")] | length' \
  | grep -qx 0
```

If non-zero, list the failing checks by name in the per-iteration log
line. Bot suggestions usually surface the same failure shortly after; if
not, the failure is a non-bot signal and triggers escalation.

### 4. Zero open/unresolved review threads (any reviewer)

```bash
gh api graphql -f query='
  query($owner:String!, $repo:String!, $pr:Int!, $cursor:String) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$pr) {
        reviewThreads(first:100, after:$cursor) {
          nodes { isResolved, isOutdated }
          pageInfo { hasNextPage, endCursor }
        }
      }
    }
  }' -f owner="$OWNER" -f repo="$REPO" -F pr="$PR_NUMBER" \
  | jq '[.data.repository.pullRequest.reviewThreads.nodes[]
         | select(.isResolved == false and .isOutdated == false)] | length' \
  | grep -qx 0
```

Applies to **all** reviewers (humans + every bot), not just CodeRabbit.
Outdated threads (lines no longer present after a force-push) are
treated as resolved.

Bot threads can be resolved by the loop after fixing + replying. Human
threads can only be resolved by the human (or someone with the
privilege) — when one blocks the predicate, the loop pauses and asks
(see SKILL.md Phase 3).

## Pagination

For PRs with >100 review threads, paginate via `pageInfo`. The query
above already requests `pageInfo { hasNextPage, endCursor }` and
accepts a `$cursor` variable; iterate until `hasNextPage == false`,
passing `endCursor` from the previous response as the next request's
cursor, and aggregate the open-thread counts across pages.

## Why this exact order

- **Open before anything else.** A merged PR is the loop's goal; a
  closed PR makes everything else moot. Free check.
- **`mergeStateStatus` before CI assertion.** `BEHIND` and `DIRTY`
  invalidate any CI result, and rebasing to fix them will trigger fresh
  CI runs. Checking CI first wastes cycles.
- **CI before threads.** A failing required check usually produces new
  bot threads ("test X is failing"). Waiting on threads first means
  classifying churn that the next CI run will obviate.
- **Threads last.** Most expensive: requires GraphQL, may paginate,
  needs per-thread classification before any can be marked resolved.
