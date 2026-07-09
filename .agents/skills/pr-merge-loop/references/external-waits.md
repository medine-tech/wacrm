# External Waits with `Monitor`

The loop waits for four kinds of external state change: CI runs to finish,
**CodeRabbit's auto-review to land on Phase 1**, CodeRabbit's auto-rereview
after an iteration push, and GitHub's `mergeStateStatus` to recompute. Use
`Monitor` with an `until` predicate so the harness notifies on transition
rather than polling — `ScheduleWakeup` short sleeps would burn cache and
cost without buying anything.

**Augment is not waited on per-iteration.** Augment is triggered once via
`augment-review` at Phase 1; it does not auto-rereview on push and the loop
does not re-trigger it. See SKILL.md "Augment blind-spot trade-off" in
Guidelines.

## Pattern

```bash
until <condition>; do sleep 15; done
```

Run this command under `Monitor`. The harness wakes the model when
the loop exits. Use 15–30 second sleeps between checks for GitHub
state; finer granularity wastes API quota without buying timeliness.

## CI completion

```bash
until [[ "$(gh pr checks "$PR_NUMBER" --required --json state \
  --jq '[.[] | select(.state == "PENDING")] | length')" == "0" ]]; do
  sleep 30
done
```

When this exits, all required checks have finished (success or
failure). Re-evaluate the predicate.

## CodeRabbit auto-review on Phase 1

CodeRabbit auto-reviews on PR open. Phase 1 waits for that first review to
land before classifying. Use `CODERABBIT_INITIAL_WAIT_SECONDS` (default 900s
= 15 min — see `loop-bounds.md`) — longer than the iteration timer because
cold-start auto-review can take 5+ min on top of a possible rate-limit
recovery window.

```bash
T_PR_OPEN=$(gh pr view "$PR_NUMBER" --json createdAt --jq .createdAt)

until coderabbit_review_landed "$T_PR_OPEN"; do
  sleep 30
done
```

`coderabbit_review_landed` is the rate-limit-guarded predicate defined
below. Persistent silence past `CODERABBIT_INITIAL_WAIT_SECONDS` escalates
to the user with a clear diagnostic: *"CodeRabbit posted no auto-review
within 15 min. Verify repo enrollment / draft status / fork status."*

## CodeRabbit auto-rereview after push

Capture push time directly when the push happens — commit author/committer
timestamps are unreliable proxies because a previously-created commit can
be pushed later, leaving old bot comments newer than `%cI` and tricking
the wait into exiting immediately.

```bash
git push --force-with-lease origin "HEAD:$PR_HEAD_BRANCH"
PUSH_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

until coderabbit_review_landed "$PUSH_TIME"; do
  sleep 30
done
```

Bounded by `BOT_SILENT_TIMEOUT_SECONDS` (default 720s = 12 min — see
`loop-bounds.md`). The same `coderabbit_review_landed` predicate fires
on either Phase 1 or iteration; only the threshold timer differs.

> **Open behavior question:** whether CodeRabbit auto-rereviews on
> `--force-with-lease` (rebase) pushes vs. only additive pushes. Verify
> empirically; if force-push does not trigger auto-rereview, the
> `BOT_SILENT_TIMEOUT_SECONDS` will fire as a false-positive after rebase
> remediation. Documented behavior: TBD.

## `coderabbit_review_landed` predicate (rate-limit guarded)

The wait must (a) cover the three GitHub surfaces CodeRabbit uses (issue
comments, inline review comments, PR reviews) and (b) treat a
`Review limit reached` / `rate limited` comment as **not** a successful
review landing. Without the rate-limit guard, the wait exits on the
rate-limit comment itself, the loop classifies an empty review pack, and
the predicate falsely converges.

```bash
coderabbit_review_landed() {
  local SINCE="$1"

  # Issue comments by coderabbitai[bot] after SINCE, excluding rate-limit notices.
  local ISSUE
  ISSUE=$(gh api repos/"$OWNER"/"$REPO"/issues/"$PR_NUMBER"/comments \
    --jq "[.[] \
          | select(.user.login==\"coderabbitai[bot]\") \
          | select(.created_at > \"$SINCE\") \
          | select((.body | test(\"Review limit reached\"; \"i\")) | not) \
          | select((.body | test(\"rate limited\"; \"i\")) | not) \
         ] | length")

  # Inline review comments (always actual review output, never a rate-limit notice).
  local INLINE
  INLINE=$(gh api repos/"$OWNER"/"$REPO"/pulls/"$PR_NUMBER"/comments \
    --jq "[.[] \
          | select(.user.login==\"coderabbitai[bot]\") \
          | select(.created_at > \"$SINCE\")] | length")

  # PR-level reviews.
  local REVIEWS
  REVIEWS=$(gh api repos/"$OWNER"/"$REPO"/pulls/"$PR_NUMBER"/reviews \
    --jq "[.[] \
          | select(.user.login==\"coderabbitai[bot]\") \
          | select(.submitted_at > \"$SINCE\")] | length")

  [[ $((ISSUE + INLINE + REVIEWS)) -gt 0 ]]
}
```

### Rate-limit escalation

Before entering the wait, do a one-shot check for an existing
`Review limit reached` comment posted after `SINCE` — if present, pause and
surface the reset window CodeRabbit reports. The loop never auto-retries on
a rate limit (retry is exactly the loop pathology that *caused* the rate
limit; see ADR 0013 and PR 6376 evidence):

```bash
RATE_LIMITED=$(gh api repos/"$OWNER"/"$REPO"/issues/"$PR_NUMBER"/comments \
  --jq "[.[] \
        | select(.user.login==\"coderabbitai[bot]\") \
        | select(.created_at > \"$SINCE\") \
        | select(.body | test(\"Review limit reached\"; \"i\"))] | length")

if [[ "$RATE_LIMITED" -gt 0 ]]; then
  echo "CodeRabbit rate-limited; pausing for user."
  # Surface the latest rate-limit comment body verbatim so the reset
  # window CodeRabbit reports is visible, then escalate.
  exit 1
fi
```

## `mergeStateStatus` recomputation

GitHub returns `UNKNOWN` briefly after a push while it recomputes.
Wait for it to settle:

```bash
until [[ "$(gh pr view "$PR_NUMBER" --json mergeStateStatus \
  --jq .mergeStateStatus)" != "UNKNOWN" ]]; do
  sleep 10
done
```

This usually settles in 5–15 seconds; cap the wait at 60 seconds and
treat persistent `UNKNOWN` as an escalation (GitHub API health
issue).

## Combining waits

When multiple external changes are in flight (CI re-running AND bots
re-reviewing after a push), run the waits **serially** under separate
`Monitor` calls rather than combining them. Combined predicates make
the exit reason ambiguous, and the cost of two sequential waits is
the same as one — the harness notifies on exit either way.
