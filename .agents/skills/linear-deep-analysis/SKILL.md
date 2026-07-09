---
name: linear-deep-analysis
description: >-
  Deeply analyze Linear issues by extracting all data, parsing Linear's
  first-class structure (labels, relations, sub-issues, acceptance criteria,
  parent PRD, blockers), processing embedded images and attachments,
  tracing code flows across the codebase, optionally exploring the local
  database and validating current-state claims against the production
  database, optionally driving the running application with Playwright to
  resolve UI-state questions, and producing detailed implementation reports
  with verified code references, a confidence rating, a solution-clarity
  rating, and a deterministic next-step waterfall dispatch. Use this skill
  whenever the user wants to analyze a Linear issue for implementation,
  investigate a Linear issue in depth, produce a feasibility report from a
  Linear case, or research what an internal request involves — even if they
  don't say "deep analysis" or "deep investigation" explicitly. Make sure to
  use this skill whenever the user asks "analyze issue X", "investigate
  PSU-X", "what does this issue need", "research Linear issue X",
  "feasibility for issue X", "deep dive on Linear case X", or provides a
  Linear issue identifier expecting a thorough investigation. When the issue
  is a migrated Zoho ticket (its title starts with a Zoho ticket number like
  "#35260") or is linked to a Sentry issue, this skill automatically follows
  the source — running zoho-deep-analysis on the original ticket and pulling
  the latest Sentry events to catch regrouped errors — so the analysis is
  grounded in the real source, not the lossy Linear summary.
argument-hint: "<issue-id>"
---

# Linear Deep Analysis

Comprehensive analysis of Linear issues for implementation planning. Unlike a quick issue read, this skill produces detailed feasibility reports with verified code references, targeting implementation agents or developers as the audience.

**Input:** `$ARGUMENTS` — Linear issue identifier (e.g., `PSU-1234`).

## Project Conventions

Before applying this skill, read the project's root `AGENTS.md` and any
`docs/*.md` files it indexes that are relevant to this task. Project-specific
conventions override this skill's generic defaults; when they conflict,
the project wins and the skill records the override in the output.

## Pipeline Overview

Six main phases plus three decimal inserts. Each builds on the previous and feeds the report:

1. **Issue Extraction** — Pull all data from the Linear issue via MCP
1.5. **Structural Extraction** — Capture Linear's first-class metadata (labels, relations, parent, sub-issues, AC, blockers), detect linked upstream sources (Zoho ticket, Sentry issue), and short-circuit downstream phases
1.6. **Linked-Source Deep Dive** *(conditional)* — when the issue is Zoho-originated, run `zoho-deep-analysis` on the source ticket and merge its findings; when it is Sentry-linked, pull the latest 10 events and detect error divergence before tracing any code
2. **Attachment Processing** — Process embedded images and attachments
3. **Request Distillation** — Transform request prose into concrete requirements; when explicit acceptance criteria exist, use them as the contract instead of re-deriving need from prose
4. **Codebase Research** — Map the request to affected code across all layers; explore local DB when a flow turns on table shape
4.5. **UI Investigation** *(Playwright, conditional)* — Drive the running app when the issue references URLs, describes visual symptoms, or touches frontend components
5. **Feasibility Assessment** — Rate complexity, solution clarity, and confidence; validate against production DB when a claim turns on live data
6. **Report Generation + Verification Loop** — Produce the final report and verify every reference, then dispatch via the Section 9 waterfall

---

## Phase 1: Issue Extraction

Extract ALL information from the Linear issue.

### Step 1 — Fetch the issue

```text
mcp__linear-server__get_issue
  id: $ARGUMENTS
  includeRelations: true
```

Extract: `id`, `identifier`, `title`, `description`, `state`, `priority`, `labels[]`, `assignee`, `creator`, `team`, `project`, `cycle`, `parent`, `children[]`, `relations[]` (blocks / blocked-by / related), `attachments[]` (each `title` + `url`), `createdAt`, `updatedAt`, `url`.

`attachments[]` is load-bearing for Phase 1.5: this is where the issue's *upstream sources* surface. A ticket migrated from Zoho carries a `soporteflexio.com` attachment titled `Ticket Zoho #<number>`; an issue created by the Sentry → Linear integration carries a `sentry.io` attachment linking the production error. Capture every attachment's title and URL verbatim — Phase 1.5 Step 6 parses them.

### Step 2 — Get comments

```text
mcp__linear-server__list_comments
  issueId: <issue_id>
```

For each comment extract: `author`, `createdAt`, `body` (full markdown), embedded images, and any attachments referenced.

### Step 3 — Extract embedded images from description and comments

```text
mcp__linear-server__extract_images
  markdown: <description or comment body>
```

Run this for the issue description and for every comment body that may contain `![...](...)` markdown image syntax.

### Phase 1 deliverable

- Issue metadata (identifier, title, state, priority, labels, project, cycle)
- Author + assignee
- Full description (verbatim)
- All comments chronologically with timestamps and authors
- Complete relation graph (parent, children, blocks, blocked-by, related)
- Attachment list (title + URL), including any Zoho or Sentry source links
- Embedded image references

---

## Phase 1.5: Structural Extraction

Linear issues carry structured metadata that Zoho tickets do not. Capture it explicitly — this is where Linear earns its keep over an unstructured ticket system, and the downstream phases use these signals to short-circuit work.

### Step 1 — Read the labels

Walk `labels[]` from Phase 1. The team-specific label namespaces this skill cares about:

- **`Tipo de Caso`** — `Bug`, `Improvement`, `Feature`, `Question`, …
- **`Tipo de Test`** — when present, indicates which test layer is expected
- **`Categoría de Bug`** — when present on a bug, narrows the affected area
- **`Priority`** / **`Severity`** — orthogonal urgency signals

Record every relevant label in Section 2.4 of the report.

### Step 2 — Detect acceptance criteria in the body

Scan the description (and parent description, if any) for markdown markers that indicate an explicit AC block:

- `## Acceptance Criteria`
- `### AC`
- `### Acceptance Criteria`
- A `- [ ]` checklist under any of the above headers

If found, extract the AC verbatim. **AC short-circuits Phase 3:** when explicit AC exists, use it as the *Actual Need* (Section 2.2 of the report) instead of interpreting need from prose. AC is the contract; prose interpretation is what you do when AC is absent.

### Step 3 — Resolve the parent issue and detect PRD shape

If `parent` is set in Phase 1, fetch the parent:

```text
mcp__linear-server__get_issue
  id: <parent.id>
  includeRelations: true
```

Then run **strict PRD-shape detection** on the parent's description. The markers must match the actual output of `/write-a-prd` (see that skill's `references/prd-template.md`), not a generic "has an AC block" heuristic — Acceptance Criteria headers are common on regular Linear tickets and would produce false positives that bypass needed PRD formalization.

Required: the parent body must contain **at least 3** of the following PRD-distinctive headers (level `###`, case-insensitive, leading/trailing whitespace ignored):

- `### Problem`
- `### Outcome`
- `### Appetite`
- `### Non-Goals`
- `### Requirements`
- `### State Coverage`
- `### Implementation Slices`
- `### Open Questions`

The threshold is **3 markers minimum** because a real `/write-a-prd` output always carries all of *Problem*, *Outcome*, *Appetite*, *Non-Goals*, *Requirements*, *State Coverage*, *Implementation Slices*, and *Open Questions*. Three of those together is a structural signature a regular ticket — even one with `### Problem` + `### Requirements` — does not produce. Single-marker matching (the older draft of this rule) misfires on plain tickets and is the failure mode this section guards against.

Record the result as a boolean (`parent_is_prd: true | false`). This boolean feeds the Section 9 waterfall's Gate D — when `true`, the dispatch skips `/write-a-prd` even at non-Low complexity and goes straight to `/do-task`, passing the parent PRD as input context. False negatives (skip the optimization) are cheap; false positives (skip a needed PRD) are expensive, so the detection errs strict.

Whether or not the parent is PRD-shaped, fold its description into Phase 4 codebase research as additional context — a sub-issue without its parent is half the story.

### Step 4 — Read the relation graph

From `relations[]` and `children[]`:

- **`blocked by` open issues** → flag in Section 5.5 Dependencies of the report. The Section 9 waterfall **refuses to dispatch to `/do-task`** when an open blocker exists, even at Low complexity. Implementing on top of an open blocker is wasted work.
- **`blocks` open issues** → record for context; do not gate dispatch.
- **`related` issues** → record for context; fetch their titles for Section 2.4 but do not pull their full bodies unless they share a code surface with this issue.
- **Sub-issues (`children[]`)** → record count and identifiers. If this issue itself is a parent with children, the implementation may already be decomposed — note that in Section 2.4.

### Step 5 — Apply label-based emphasis short-circuits

Use labels to weight downstream phase emphasis:

- **`Tipo de Caso: Bug`** → Phase 4.5 UI investigation (Playwright) is high-value; Phase 5 production DB validation is more likely to settle the root cause. Emphasize both.
- **`Tipo de Caso: Feature`** → Phase 5 emphasis shifts to Solution Clarity. A feature with `Needs Design Exploration` clarity should route through `/grill-me` (Gate C); skipping past Gate C on a feature is a known failure mode.
- **`Tipo de Caso: Improvement`** → behaves like Feature for clarity, like Bug for code mapping precision.

These are weighting hints, not hard rules. The full phases still run.

### Step 6 — Detect linked upstream sources

A Linear issue is often a *thin shell* over a richer source. Support tickets are migrated from Zoho (the original client conversation, screenshots, PDFs, and videos live in Zoho — the migration captures only a summary); production bugs are filed by the Sentry → Linear integration (the real stacktrace and event history live in Sentry, not in the one-line title). Detecting that source is what turns a shallow read into a grounded one, so scan two places — the title and `attachments[]` — and record what you find. Each detected source opens a branch in **Phase 1.6**.

**Zoho origin.** The Zoho → Linear migration writes the ticket number into the title and adds a Zoho attachment. Treat the issue as Zoho-originated when **either** signal fires:

- The title begins with a Zoho ticket number: `#?<4–6 digits>` followed by a space or `-` (e.g., `#35260 NC se cuelan…`). The leading `#` is optional; the migration usually writes it.
- An attachment's URL contains `soporteflexio.com/.../casos/details/` or its title matches `Ticket Zoho #<number>`.

Extract the **human-readable ticket number** (the short one, e.g. `35260` — not the long internal `338638…` id in the URL). That number is exactly what `zoho-deep-analysis` takes as input. Record `zoho_ticket: <number>` (or `none`). When both signals fire, they should agree; if they disagree, prefer the attachment's number and note the mismatch.

**Sentry link.** The Sentry → Linear integration attaches the production error. Treat the issue as Sentry-linked when an attachment URL contains `sentry.io`. The attachment URL usually points at a *specific event*, not the issue:

```
https://sentry.io/organizations/<org-slug>/issues/<issue-id>/events/<event-id>/
```

Parse it and pull out the parts Phase 1.6 needs:

- `org_slug` — the segment after `organizations/` (e.g. `medinetech`). Read it straight from the URL; don't call `find_organizations`.
- `issue_id` — the numeric id after `issues/` (e.g. `7286244683`).
- `event_id` — the id after `events/`, when present. This is the **originally reported** event — the one a person looked at when the link was created. Phase 1.6b compares it against the *latest* event to catch Sentry regrouping.

Then build **two** URLs, because the Sentry MCP needs an issue-level URL for the overview and event search, *not* the event URL the attachment carries:

- `issue_url` = `https://sentry.io/organizations/<org_slug>/issues/<issue_id>/` — the canonical issue-level URL. Phase 1.6b passes this to `get_sentry_resource` and `search_issue_events`. Passing the raw event URL instead would make `get_sentry_resource` resolve a single event rather than the issue overview.
- `event_url` = the original attachment URL (the event link). Phase 1.6b uses it (or `event_id`) only to fetch the originally-reported event for the divergence comparison.

Record `sentry_issue` as a **list** — one entry per `sentry.io` attachment, `[]` when none:

```
sentry_issue: [ { issue_url, event_url, org_slug, issue_id, event_id | null }, ... ]
```

Most issues have exactly one Sentry attachment, but model it as a list so Phase 1.6b can run its procedure per entry without ambiguity.

Both branches are independent: an issue can be Zoho-originated, Sentry-linked, both, or neither. Detection here is cheap metadata extraction; the actual investigation is deferred to Phase 1.6 so it stays conditional.

### Phase 1.5 deliverable

- Labels list with the project's namespaced labels broken out
- AC block (extracted verbatim) or `none`
- Parent issue identifier + `parent_is_prd` boolean
- Blocked-by list (open issues only)
- Sub-issue count
- `zoho_ticket` (number or `none`) and `sentry_issue` (list of parsed Sentry links, `[]` when none) — the linked-source signals that drive Phase 1.6
- Emphasis short-circuits applied (logged so the report consumer knows why some phases ran deep and others ran shallow)

---

## Phase 1.6: Linked-Source Deep Dive *(conditional)*

Run this phase when Phase 1.5 Step 6 detected a Zoho origin or a Sentry link. Skip it entirely when both are `none` — most issues born inside Linear have no upstream source and go straight to Phase 2.

The two branches are independent. Run whichever fired; run both when both did, **Zoho first** (it reframes *what the request actually is*) then **Sentry** (it reframes *what the error actually is*). Both branches run *before* Phases 2–4 on purpose: their findings reground attachment processing, distillation, and codebase research, so everything downstream is anchored to the source instead of the lossy Linear shell.

### Branch 1.6a — Zoho origin (`zoho_ticket` ≠ `none`)

A migrated support ticket is a summary; the authoritative record — the full client conversation, the screenshots, the PDFs, the screen-recording videos — never left Zoho. Running `zoho-deep-analysis` on the ticket grounds this report in that record rather than in the migration's two-paragraph distillation.

**Run it:**

- Prefer a **forked subagent** so Zoho's heavy extraction (attachment downloads, ffmpeg frame extraction, reading many files) lands in its own context window instead of bloating this analysis. Dispatch `Agent(subagent_type: "general-purpose")` with the prompt `Activate /zoho-deep-analysis <zoho_ticket>`, and capture the report it returns.
- If subagents are unavailable, run `zoho-deep-analysis` inline.

**Fold in — don't redo:** `zoho-deep-analysis` and this skill share most of their pipeline, so consume its output rather than repeating the work.

- Its **Request Distillation** (stated vs. actual need, explicit/implicit requirements, in the client's own words) is the source of truth for Sections 2.1–2.2 and **short-circuits Phase 3**. The client wrote the request; the Linear summary only paraphrased it.
- Its **Attachment Analysis** becomes Section 3. Zoho holds the real files — do not re-download what the subagent already processed.
- Its **Codebase Mapping** seeds Phase 4 — verify and extend it, don't start from a blank page.

**Reconcile — this is what Linear adds over a bare Zoho run:**

- Diff what the Linear issue *says* against what the Zoho ticket *contains*. Migration loses fidelity — a comment added in Zoho post-migration, an attachment that didn't transfer. Any gap becomes an Unresolved Question (Section 8).
- Overlay Linear's structural metadata from Phase 1.5 (labels, parent PRD, blockers) — Zoho carries none of it, and it drives the dispatch.
- The Confidence / Solution Clarity ratings and the **Section 9 dispatch stay owned by *this* report**, computed over the merged evidence. Ignore the Zoho report's own Next Step — a single issue gets one dispatch. (No recursion risk: `zoho-deep-analysis` never calls back into this skill.)

### Branch 1.6b — Sentry link (`sentry_issue` non-empty)

The Linear title captures **one** Sentry event, frozen when the integration created the link. But Sentry groups events by a fingerprint, and that grouping is lossy: over days or weeks, genuinely different errors that share a similar shape can pile into the same issue. So the bug a developer should actually fix lives in the **latest** events — and it may not be the error in the title. Pulling the latest 10 events and checking for that divergence *before* tracing any code is the entire point of this branch.

Run the procedure below once per entry in `sentry_issue` (usually just one). Read `references/sentry-event-analysis.md` for the full procedure. The shape:

1. **Issue overview** — `mcp__sentry__get_sentry_resource` with `url: <entry.issue_url>` (the canonical issue-level URL, not the event link) → title, culprit, level, status, first/last seen, total event count, linked issues.
2. **Latest 10 events** — `mcp__sentry__search_issue_events` with `issueUrl: <entry.issue_url>`, `sort: "-timestamp"`, `limit: 10`.
3. **Divergence check** — group the 10 by *signature* (exception type + culprit / `file:line` + top in-app frame). If the most-recent signature differs from the **originally reported** one (the title, or the `entry.event_id` event from Phase 1.5), the issue has merged ≥ 2 distinct errors. Flag it loudly — this is the failure mode the branch exists to catch, and it changes what gets fixed.
4. **Full stacktrace** — `get_sentry_resource` on the latest event (and on the original event, via `entry.event_url` or `entry.event_id`, when it diverges) for in-app frames, breadcrumbs, request context, and tags (environment, release, user impact).
5. **Feed forward** — the *current* signature(s) become the real target of Phase 4 codebase research; trace their `file:line` into the code. Never trace the title blindly when the latest events say something else.

**Fold in:** Section 4.6 (Sentry Event Analysis) carries the latest-events table, the divergence verdict, and the traced current error. A detected divergence **caps Section 5.8 Confidence below High** until both signatures are traced and the report states explicitly which one the dispatched fix targets.

### Phase 1.6 deliverable

- When 1.6a ran: a one-line note that `zoho-deep-analysis` was run on `#<zoho_ticket>`, plus the merged request/attachment/codebase findings and any migration-drift questions
- When 1.6b ran: the Sentry issue overview, the latest-10-events signature table, the divergence verdict (`aligned` | `diverged — original <A> vs. latest <B>`), and the traced current `file:line`
- When neither ran: nothing — the phase is skipped

---

## Phase 2: Attachment Processing

Process every attachment and embedded image referenced in Phase 1.

**Short-circuit (Zoho origin):** if Branch 1.6a ran, `zoho-deep-analysis` already downloaded and analyzed the source attachments — fold its Attachment Analysis into Section 3 and process here only the attachments native to the Linear issue that the Zoho run did not cover (excluding the `soporteflexio.com` link itself, which is the source pointer, and any `sentry.io` link, which Branch 1.6b owns).

### Step 1 — List attachments

Linear attachments live alongside the issue; the MCP exposes them through:

```text
mcp__linear-server__get_attachment
  id: <attachment_id>
```

Discover IDs from the issue body, comment bodies, or any inline attachment markers Linear renders. For each attachment, record the file name, type, and a one-line summary of its relevance to the request.

### Step 2 — Download and inspect

For embedded images, the URLs returned by `mcp__linear-server__extract_images` are public Linear CDN URLs. Download with `curl` (no auth):

```bash
mkdir -p ~/Downloads/linear-$ARGUMENTS
curl -s -L -o ~/Downloads/linear-$ARGUMENTS/<filename> '<image_url>'
```

For non-image attachments, fetch via the MCP `get_attachment` tool when content access is needed.

### Step 3 — Read downloaded files

Use the `Read` tool to extract content from each file:

- **Images** (`.png`, `.jpg`, `.gif`, `.webp`) — visual analysis
- **PDF** — read text and visual content
- **Spreadsheets** (`.xlsx`, `.xls`, `.csv`) — read structure, note column headers, sample rows
- **JSON / text / log** — read directly

For unsupported types (`.docx`, `.pptx`, …), ask the user for a screenshot or copy-paste of the relevant content.

### Phase 2 deliverable

| File | Type | Key Content | Relevance |
|------|------|-------------|-----------|
| [filename] | [type] | [summary] | [how it relates] |

---

## Phase 3: Request Distillation

Transform the request into concrete requirements.

**Short-circuit (AC):** if Phase 1.5 found an explicit Acceptance Criteria block, treat the AC as the *Actual Need* and skip prose interpretation. AC is the contract — re-deriving need from prose when an AC block exists creates drift between report and issue.

**Short-circuit (Zoho origin):** if Branch 1.6a ran, the `zoho-deep-analysis` Request Distillation — built from the client's own words in the original ticket — is the base for Sections 2.1–2.2. Carry it over rather than re-distilling from the Linear summary. A Linear AC block, when present, still refines it; the Zoho distillation supplies the need, the AC supplies the contract.

When neither short-circuit applies, use the framework below.

### Analysis framework

1. **Stated Request** — Quote exact phrases from description and key comments; identify action verbs
2. **Actual Need** — Interpret the business goal behind the request
3. **Explicit Requirements** — Each with source (description / comment / attachment / parent issue)
4. **Implicit Requirements** — Each with reasoning
5. **Ambiguities** — Specific questions for clarification (these feed Section 8 and Gate A of the waterfall)

### Common translation patterns

| Author Says | Usually Means |
|-------------|---------------|
| "Doesn't work" | Specific error or unexpected behavior |
| "Should be like X" | Match functionality / UX of X |
| "Users can't" | Permission, validation, or UX issue |
| "Too slow" | Performance threshold exceeded |
| "Add option to" | New configuration or feature flag |

### Phase 3 deliverable

- Stated vs actual need comparison (or AC block when present)
- Numbered explicit requirements with sources
- Numbered implicit requirements with reasoning
- Flagged ambiguities as questions

---

## Phase 4: Codebase Deep Research

Map the request comprehensively to the codebase.

Read `references/codebase-research.md` for project detection rules and path references for Flexio and Portal.

**Consume Phase 1.6 first, when it ran:**

- **Sentry (1.6b):** trace the `file:line` of the *current* error signature established in Phase 1.6b — the one from the latest events — not the title. When 1.6b flagged a divergence, trace **both** the originally-reported and the latest signatures, and let Section 4.6 record which one the report ultimately targets. Sentry's stacktrace already hands you the entry frame; start the trace there.
- **Zoho (1.6a):** start from the `zoho-deep-analysis` codebase map and verify/extend it, rather than re-deriving the same paths.

### Research strategy

Use `mcp__auggie-mcp__codebase-retrieval` for architecture queries, `mcp__auggie__augment_code_search` for finding specific symbols, and `Task(Explore)` for comprehensive search. Cover all layers:

- **Domain:** Entities, Value Objects, Domain Events, Domain Services
- **Application:** Use Cases, Command / Query handlers, DTOs
- **Infrastructure:** Controllers, Repositories, DB tables / migrations, External integrations
- **Frontend (if applicable):** Components, state management, API calls

### Code path tracing

For each feature, trace the full path:

```
Entry Point (Controller / API)
  -> Application Service / Use Case
    -> Domain Service (if any)
      -> Repository
        -> Database Table
```

Always verify file paths exist before reporting them. Prefer semantic search over Grep for initial discovery; use Grep / Glob to lock in exact symbols once located.

### Local database exploration

When code tracing names tables whose shape, foreign keys, or sample data would settle a design question, run read-only queries against the **local** project DB.

Read `references/local-db-investigation.md` for the full procedure: `docker compose exec mysql` commands for schema / FKs / reverse FKs / sample data / cross-table JOIN validation. The rules: read-only, `LIMIT` on data queries, never UPDATE / DELETE / INSERT.

Local DB exploration is *exploratory*, not validating — it informs Phase 4's code map. Validation against *production* data is a separate, gated step in Phase 5.

### Phase 4 deliverable

- **Project(s):** Portal / Flexio / Both
- Mapped components per layer
- Complete code path traces with `file:line` references
- Local DB findings (schemas, FKs, sample-data observations) when explored

---

## Phase 4.5: UI Investigation (Playwright)

Drive the running application with a headless browser to resolve doubts that code + DB analysis alone cannot answer.

Read `references/playwright-ui-investigation.md` for the full procedure: credentials, navigation targets, login template, per-page investigation pattern, visual analysis, and cleanup.

### When to run

Execute this phase when **ANY** of these apply:

- The issue references URL paths (e.g., `/pedidos/listar`, `/ordenes/crear`)
- The issue describes a visual / UI symptom (wrong label, missing data, broken layout, modal issue)
- Phase 4 left open questions about actual UI state
- Phase 1 found embedded screenshots and the rendered UI may have drifted since
- Phase 4 code tracing surfaced frontend components (`.vue` files) involved

Skip when the issue is purely backend / API with no UI component.

### Phase 4.5 deliverable

Per page visited:

- URL path
- Screenshot path + description of what is visible
- Console errors observed (or "none")
- Grid / table row counts where relevant
- Cross-reference with Phase 4 (code) and any local-DB findings — match / mismatch noted

---

## Phase 5: Feasibility Assessment

Determine implementation feasibility, rate complexity, solution clarity, and confidence; validate against the production DB when a claim turns on live data.

### Gap analysis

| Aspect | Current State | Desired State | Gap |
|--------|---------------|---------------|-----|
| Feature | [what exists] | [what's needed] | [delta] |
| Data | [current schema] | [required schema] | [changes] |
| API | [current endpoints] | [new / modified] | [changes] |
| UI | [current UI] | [expected UI] | [changes] |

### Complexity rating

| Rating | Criteria |
|--------|----------|
| **Low** | Config change, simple CRUD, copy existing pattern |
| **Medium** | New feature in existing module, moderate refactoring |
| **High** | Cross-module changes, new patterns, significant testing |
| **Very High** | Architectural changes, data migrations, external integrations |

### Confidence assessment

Every report carries one confidence rating — the honest answer to "how much should a reader trust this feasibility verdict?" It is a tier, not a number: an LLM percentage reads as rigor it has not earned and contradicts the skill's no-speculation rule.

| Tier | Criteria |
|------|----------|
| **High** | Every current-state claim is code-verified or DB-verified; no assumption sits on the critical path. |
| **Medium** | The core path is verified, but at least one material claim rests on unverified code or an assumption — or a DB-answerable gap exists and was not checked. |
| **Low** | Key claims are unverified, blockers are unresolved, or the request itself is still ambiguous. |

When confidence is below High, name the *specific* evidence that would raise it — e.g., *"Medium → would be High if production confirms `invoice_config` has a row for account 4471."* That line is the lever: it tells the reader, and the report's Next Step waterfall (Gate B), exactly what is missing.

### Solution Clarity assessment

Confidence answers "do I trust the verdict?" Solution Clarity answers a different question: "do I know what to write?" The two are independent.

| Rating | Criteria |
|--------|----------|
| **Clear** | Required Changes lists concrete action verbs (no "TBD", "depends on...", "need to decide"); Code Path Trace is complete from controller to DB; Implementation Guidance reads as a recipe a developer could follow without architectural decisions. |
| **Needs Design Exploration** | Required Changes contains open architectural choices (e.g., "either extend X or add new Y"); Code Path Trace has gaps or competing alternative paths; Implementation Guidance would need DDD lanes — bounded context placement, aggregate shape, event design — resolved before code can be written. |

Solution Clarity feeds the Section 9 waterfall's Gate C: `Needs Design Exploration` dispatches the report into `/grill-me` before any implementation skill runs.

### Production database validation (gated)

Confidence rises fastest when an unverifiable claim is checked against live data — code shows what is *possible*; the production database shows what *actually is*. This step is **gated**: it runs only when Phase 4 produced a specific, named claim that code alone cannot settle and that the database can (does a row exist, what is a count, what is a production config value). It never runs speculatively, and most issues never need it.

Collect every DB-answerable gap from the gap analysis and escalate **once**, as a batch — one connection, all queries, then re-assess confidence. Read `references/production-db-validation.md` for the full procedure: the gated trigger, the user-supplied production host, the `docker compose exec` connection, the SELECT-only safety model, the load-bearing SQL-shape guard, and the PII rules.

A validation failure — no connection, stack down, timeout — never blocks the report: the affected gap degrades to an Unresolved Question and the report's confidence is capped at Medium.

### Phase 5 deliverable

- Current state summary with code refs
- Gap analysis table
- Complexity rating with justification
- Solution Clarity rating with justification tied to Sections 4.3, 5.2, and 6
- Confidence rating, with the "what would raise it" line when below High
- DB-verified findings with their queries, when production validation ran
- Risk list with mitigations
- Dependencies / blockers list (carrying over from Phase 1.5)

---

## Phase 6: Report Generation + Verification

Produce the final implementation-ready report and verify every reference.

Read `references/report-template.md` for the complete template and section guidelines. The report has 9 sections: Executive Summary, Issue Analysis (with Section 2.4 Linear Context), Attachment Analysis, Codebase Mapping, Feasibility Assessment (carrying Complexity, Solution Clarity, Confidence), Implementation Guidance, Verified Code References, Unresolved Questions, and the Section 9 dispatch waterfall.

### Verification loop

Before finalizing:

1. **Code reference verification** — Re-read EVERY `file:line` reference. Confirm the code matches. Mark each as `(verified)`.
2. **DB-claim verification** — Every DB-verified claim cites the exact `SELECT` that produced it and is marked `(verified — production DB, YYYY-MM-DD)`. The query text belongs in the report; raw result rows do not.
3. **Claim verification** — Every assertion about system behavior must be backed by code or by a DB-verified finding. No speculation.
4. **Structural extraction sanity check** — Section 2.4 lists labels, AC presence, parent + `parent_is_prd`, blockers, sub-issue count, and the origin / linked source. If any of those came from Phase 1.5 but are missing in the report, add them.
5. **Linked-source reconciliation check** — When Branch 1.6a ran, Sections 2.1–2.2 must reflect the Zoho request distillation (not just the Linear summary) and Section 3 must include the Zoho attachments; any migration drift belongs in Section 8. When Branch 1.6b ran, Section 4.6 must carry the divergence verdict, and the `file:line` traced in Phase 4 must be the **current** Sentry signature — not the title — whenever the verdict is `diverged`. Tracing the title's stale error after Sentry showed it regrouped is the failure mode this check catches.
6. **Completeness check** — All sections filled, all attachments processed, all requirements addressed.
7. **Confidence honesty check** — The confidence tier must match the evidence: "High" holds only when no assumption sits on the critical path. The Medium cap applies when a DB-answerable gap was needed but could not be validated, or when a `diverged` Sentry verdict (4.6) is unresolved — an issue with no such gap reaches High on code verification alone.
8. **Solution Clarity honesty check** — The Clarity rating must match the evidence in Sections 4.3, 5.2, and 6. A "Clear" rating requires concrete action verbs in Required Changes, a complete Code Path Trace, and an Implementation Guidance section that reads as a recipe. Inflating Clarity to "Clear" so the report dispatches to `/do-task` directly is the failure mode this check exists to catch.

### If verification fails

- Invalid code ref → remove or correct
- Missing info → add to Unresolved Questions
- Uncertain claim → reframe as question

### Final output criteria

Only finalize the report when:

- All code references verified by reading actual files
- Every DB-verified claim cites its query
- All claims backed by evidence
- The confidence tier honestly reflects what was verified
- All ambiguities documented as questions
- No placeholders or TODOs remain

---

## Output Guidelines

- **Language:** English (all technical content)
- **Precision:** Every claim needs a `file:line` reference
- **Honesty:** State clearly when uncertain or info is missing
- **Audience:** Implementation agent or developer
- **No speculation:** If not verified, it's a question

When information is insufficient, don't guess. State what was searched for, what was found (or not), list specific questions for clarification, and suggest where to look or who to ask.
