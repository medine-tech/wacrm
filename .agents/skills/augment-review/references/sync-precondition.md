# Sync Precondition

A stale branch produces stale review suggestions and a stale push. This
protocol catches the common mistake modes before any remote-mutating
action.

## Why this exists

Two failure modes appear repeatedly without this check:

- The user runs the skill from a branch that's drifted from `origin` (a
  collaborator force-pushed, or a CI deploy rewrote history). The skill
  then commits on top of the stale local state and `--force`-pushes,
  silently dropping the collaborator's work.
- The PR branch is `BEHIND` the base branch (e.g. `main` moved on while
  the PR was open). Bots review against the stale diff, and any
  resulting fixes have to be redone after the inevitable rebase.

Catching both states up front costs one `git fetch` and one
`gh pr view`. Skipping the check costs a recovery operation that may
not be possible.

## Protocol

Run these four checks in order. Stop at the first failure and surface
the state to the user with a concrete next action — never auto-resolve.

### 1. Right branch checked out

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
PR_HEAD_BRANCH=$(gh pr view "$PR_NUMBER" --json headRefName --jq .headRefName)

if [[ "$CURRENT_BRANCH" != "$PR_HEAD_BRANCH" ]]; then
  echo "Current branch ($CURRENT_BRANCH) is not the PR head ($PR_HEAD_BRANCH)."
  echo "Switch with: git checkout $PR_HEAD_BRANCH"
  exit 1
fi
```

Never auto-switch. The user might have staged work on the current
branch that would be lost on checkout, and the right move depends on
context the skill can't see.

### 2. No uncommitted changes

```bash
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Uncommitted changes present:"
  git status --short
  echo "Commit or discard them before continuing."
  exit 1
fi
```

Never `git stash` silently. Stashed work disappears from `git status`
and the user may not realize anything happened; a later loop iteration
or commit can lose it entirely.

### 3. Local in sync with `origin/<PR-branch>`

```bash
git fetch origin "$PR_HEAD_BRANCH"

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$PR_HEAD_BRANCH")
BASE=$(git merge-base HEAD "origin/$PR_HEAD_BRANCH")

if [[ "$LOCAL" == "$REMOTE" ]]; then
  : # in sync
elif [[ "$LOCAL" == "$BASE" ]]; then
  # local is behind — fast-forward is safe
  git pull --rebase --no-autostash origin "$PR_HEAD_BRANCH"
elif [[ "$REMOTE" == "$BASE" ]]; then
  : # local is ahead — fine, push happens later
else
  echo "Local and origin have diverged (commits on both sides)."
  echo "A collaborator may have force-pushed. Inspect with:"
  echo "  git log HEAD..origin/$PR_HEAD_BRANCH"
  echo "  git log origin/$PR_HEAD_BRANCH..HEAD"
  exit 1
fi
```

The diverged case is the dangerous one. A blind `git pull --rebase` can
silently drop a collaborator's commits if their changes touch the same
lines we modified. Surface it and ask.

`--no-autostash` is the correct git form (`--autostash=false` is not a
valid flag); naming `origin` and the branch explicitly protects against
misconfigured upstream tracking.

### 4. PR not behind base

```bash
MERGE_STATE=$(gh pr view "$PR_NUMBER" --json mergeStateStatus --jq .mergeStateStatus)

if [[ "$MERGE_STATE" == "BEHIND" ]]; then
  BASE_REF=$(gh pr view "$PR_NUMBER" --json baseRefName --jq .baseRefName)
  git fetch origin "$BASE_REF"
  git rebase "origin/$BASE_REF"
  git push --force-with-lease origin "HEAD:$PR_HEAD_BRANCH"
fi
```

Always `--force-with-lease`, never `--force`. The lease fails if
`origin/<PR-branch>` advanced since our last fetch, protecting
collaborator pushes that landed between our fetch and our push.

## When the skill aborts

Any check that exits non-zero surfaces a one-line state report and the
concrete next command the user can run. The skill does not retry,
auto-stash, or auto-resolve — those decisions need human context.

When this skill runs inside `pr-merge-loop`, the orchestrator re-runs
this whole protocol at the start of every iteration, so collaborator
pushes mid-loop are caught at the next iteration boundary rather than
silently overwritten.
