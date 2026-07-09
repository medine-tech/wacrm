# Sentry Event Analysis (Phase 1.6b)

The procedure for the Sentry branch of the Linked-Source Deep Dive. Reach here
from `SKILL.md` Phase 1.6b when Phase 1.5 Step 6 recorded a `sentry_issue`.

## Why this exists

The Linear title is a snapshot of **one** Sentry event — the one a person was
looking at when the Sentry → Linear integration created the link. Sentry groups
events into an *issue* by a fingerprint, and that grouping is deliberately
fuzzy: it collapses events it judges "the same". Over days or weeks, two
genuinely different failures that share a similar shape (same exception class
from a different call site, or the same entry point failing for a new reason)
can land in the **same** issue. When that happens, the latest events describe a
different bug than the title does — and a developer who trusts the title fixes
the wrong thing.

So the job here is not "read the Sentry error". It is: **pull the recent event
history, decide whether the issue still describes one error or several, and hand
Phase 4 the signature that is actually happening now.**

## Inputs (from Phase 1.5 Step 6)

`sentry_issue` is a **list** of entries (one per `sentry.io` attachment, `[]`
when none). Run this procedure once per entry. Each entry:

```
{ issue_url, event_url, org_slug, issue_id, event_id | null }
```

The Linear attachment URL usually points at a *specific event*:

```
https://sentry.io/organizations/<org-slug>/issues/<issue-id>/events/<event-id>/
```

Phase 1.5 parses that into the fields below and derives the issue-level URL the
MCP actually needs. The split matters: passing the **event** URL to
`get_sentry_resource` resolves a single event, not the issue overview, and
`search_issue_events`'s `issueUrl` expects an issue-level URL.

Worked example (the PLI-2440 attachment):

| Field | Value |
|-------|-------|
| `event_url` (raw attachment) | `https://sentry.io/organizations/medinetech/issues/7286244683/events/a7c71d18568e43d4b49350b4d78fead9/` |
| `org_slug` | `medinetech` |
| `issue_id` | `7286244683` |
| `event_id` | `a7c71d18568e43d4b49350b4d78fead9` *(the originally reported event)* |
| `issue_url` (derived) | `https://sentry.io/organizations/medinetech/issues/7286244683/` |

`issue_url` is always `https://sentry.io/organizations/<org_slug>/issues/<issue_id>/` — use it for Steps 1–2. `event_url` / `event_id` may be absent when the attachment already points at the issue root (`…/issues/<id>/` with no `/events/…`). That is fine — the divergence check then compares the latest event against the *issue title* instead of a specific original event.

All MCP reads below are **read-only**; this branch never mutates Sentry state.

## Step 1 — Issue overview

```text
mcp__sentry__get_sentry_resource
  url: <entry.issue_url>
```

Pass `issue_url` (the `…/issues/<issue_id>/` form), not `event_url` — the resource type then auto-detects as `issue`. An event URL would resolve a single event instead. Capture:
`title`, `culprit`, `level`, `status` (resolved / unresolved / ignored),
`firstSeen`, `lastSeen`, total event/user counts, and any linked issues. This
is the **issue-level** picture — the fingerprint's summary, which is exactly the
view that can hide a merge.

## Step 2 — Latest 10 events

```text
mcp__sentry__search_issue_events
  issueUrl: <entry.issue_url>
  sort: "-timestamp"
  limit: 10
  statsPeriod: "90d"
```

`sort: "-timestamp"` returns most-recent first. `statsPeriod: "90d"` is a
sensible default window; widen it (`180d`, `1y`) if the issue is old and fewer
than ~10 events come back, since the goal is to see how the error has drifted
over its lifetime. Each event carries its own exception type, message, culprit,
and stacktrace — that per-event detail is what the issue-level summary flattens.

## Step 3 — Signature & divergence check

Reduce each of the (up to) 10 events to a **signature**:

```
<exception type/class> @ <culprit or top in-app frame file:line> :: <normalized message>
```

Normalize the message by stripping volatile bits (ids, counts, account names,
timestamps) so "Error: La bodega es requerida for invoice 4471" and the same
text for invoice 9920 collapse to one signature.

Then compare:

- **Originally reported signature** — from the `event_id` event (fetch it in
  Step 4 if needed) or, when no `event_id`, from the issue title.
- **Latest signature** — the signature of the most recent event (top of Step 2).

Record the verdict:

| Verdict | Condition | Consequence |
|---------|-----------|-------------|
| **`aligned`** | Latest signature ≈ original signature; all 10 events share essentially one signature | The title is trustworthy. Trace it in Phase 4 as usual. |
| **`diverged`** | Latest signature ≠ original, **or** the 10 events split into ≥ 2 distinct signatures | The issue has merged distinct errors. Flag it loudly. The fix target is the **current** error, not the title. |

When diverged, build a small distribution so the report shows the split, not
just a binary flag:

| Signature | Events (of 10) | First / last in window | Is this the title's error? |
|-----------|----------------|------------------------|----------------------------|
| `TypeError @ Foo.php:88 :: ...` | 7 | 2026-05-30 / 2026-06-05 | no — **current** |
| `RuntimeException @ Bar.php:101 :: La bodega...` | 3 | 2026-02-23 / 2026-03-10 | yes — original, now rare/stale |

## Step 4 — Full stacktrace for representative events

Pull the complete event for each signature you will act on — always the latest,
plus the originally reported event when the verdict is `diverged`. For the
original, pass `entry.event_url` directly (it already points at the event); for
the latest, build its event URL from the `id` returned by Step 2:

```text
mcp__sentry__get_sentry_resource
  url: <entry.event_url>   # or https://sentry.io/organizations/<org_slug>/issues/<issue_id>/events/<latest_event_id>/
```

(or `resourceType: "event"`, `organizationSlug: <org_slug>`, `resourceId: <event_id>`).

From each event capture: the in-app stack frames (`file:line`), the exception
chain, breadcrumbs leading to the failure, the request context (route, method,
params — redact PII), and tags: `environment`, `release`, and user impact. The
top in-app frame is the entry point for the Phase 4 trace.

## Step 5 — Feed forward into Phase 4

The signature(s) from Step 3–4 — **not the title** — are the codebase-research
target. Trace the current error's `file:line` from the stacktrace's entry frame
down to the DB. When diverged, trace both signatures and let Section 4.6 state
which one the report's dispatch targets (default: the current/most-frequent
error; note the original as a separate finding or a follow-up issue).

## Output → Section 4.6 (Sentry Event Analysis)

- Sentry issue id + link, status, first/last seen, total events
- Latest-10 signature table (Step 3)
- **Divergence verdict**: `aligned` | `diverged — original <A> vs. latest <B>`
- The traced current `file:line` (verified in Phase 4)
- When diverged: which signature the dispatched fix targets, and what happens to
  the other (folded in, or split into a new issue)

A `diverged` verdict **caps Section 5.8 Confidence below High** until both
signatures are traced and the report names the fix target explicitly. An
`aligned` verdict adds confidence — the title is corroborated by the live event
stream, not just assumed.

## Failure handling

A Sentry read failure never blocks the report — it degrades, mirroring the
production-DB rule:

- **MCP/auth/timeout failure** → record the Sentry analysis as *attempted, not
  completed*; set the divergence verdict to `unknown`; cap Confidence at Medium;
  add "verify the current Sentry error signature" to Unresolved Questions.
- **Issue already `resolved`/`ignored` in Sentry** → still analyze, but note the
  status; a resolved issue resurfacing in Linear may itself be the finding.
- **Multiple Sentry attachments** on one Linear issue → run Steps 1–4 per link
  and report each; they are usually related regressions.
