# Deep Analysis Report Template

Copy this template when generating the final report.

---

```markdown
# Linear Issue Deep Analysis Report

**Issue:** [URL] | **Identifier:** [PSU-XXXX] | **State:** [state] | **Priority:** [priority]

## 1. Executive Summary

**Confidence:** [High / Medium / Low]

[3-5 sentences covering:]
- What the issue is requesting
- What it actually needs (interpreted, or per AC when present)
- Feasibility verdict (can it be done? complexity?)
- Key blockers or risks if any

## 2. Issue Analysis

### 2.1 Stated Request
[Quote exact phrases from description / key comments]

### 2.2 Actual Need
[Concrete interpretation of what needs to be built / fixed. When explicit Acceptance Criteria exist in the issue or parent, use them verbatim here — AC is the contract.]

### 2.3 Implicit Requirements
- [Requirement inferred from context / attachments / parent issue]
- [Requirement inferred from context / attachments / parent issue]

### 2.4 Linear Context

Captured from Phase 1.5 (Structural Extraction). This section is the load-bearing record of what makes Linear an actionable system rather than free-form text.

- **Labels:**
  - `Tipo de Caso`: [Bug / Improvement / Feature / Question / ...]
  - `Tipo de Test`: [...] (or `none`)
  - `Categoría de Bug`: [...] (when present)
  - Other relevant labels
- **Acceptance Criteria:** [present | none] — [if present, summarize where it lives: description, parent issue]
- **Parent issue:** `<identifier>` — [`parent_is_prd: true | false`]
- **Sub-issues (`children[]`):** [count] — [list identifiers if ≤ 5]
- **Blocked by (open):** [list of open blocker identifiers, or `none`]
- **Blocks:** [list, or `none`]
- **Related:** [list of identifiers, or `none`]
- **Origin / linked source:** [`Zoho #<number>` — ran zoho-deep-analysis (Phase 1.6a) | `Sentry <issue-id>` — analyzed in Phase 1.6b (see 4.6) | both | `none`]
- **Project / cycle:** [name / dates]

Phase emphasis applied based on the labels above: [one or two lines naming which phases were emphasized — e.g., "UI investigation and production-DB validation emphasized due to `Tipo de Caso: Bug`"]

## 3. Attachment Analysis

| File | Type | Key Content | Relevance |
|------|------|-------------|-----------|
| filename.ext | PDF / PNG / etc. | [what it contains] | [how it relates to the request] |

[When Branch 1.6a ran, fold the `zoho-deep-analysis` Attachment Analysis into this table — Zoho holds the source files (screenshots, PDFs, screen recordings) that the Linear migration usually drops. Mark Zoho-sourced rows with `(via Zoho #<number>)`.]

## 4. Codebase Mapping

### 4.1 Existing Components
- `path/to/file.php:123` - [what this code does]
- `path/to/file.php:456` - [what this code does]

### 4.2 Affected Modules
- **Module Name**: [how this module is impacted]
- **Module Name**: [how this module is impacted]

### 4.3 Code Path Trace
```
[Controller / Endpoint]
  -> [Application Service / Use Case]
    -> [Domain Service (if any)]
      -> [Repository]
        -> [Database Table]
```

### 4.4 Local DB Findings (when explored)
- `<table_name>` — [schema observations, FK relationships, NULL patterns]
- `<table_name>` — [...]

### 4.5 UI Findings (when Phase 4.5 ran)
- `<url_path>` — screenshot at `<path>`; grid rows: [count]; console errors: [none | list]; visual findings: [...]
- `<url_path>` — [...]

### 4.6 Sentry Event Analysis (when Phase 1.6b ran)

- **Sentry issue:** `<issue-id>` — [link]; status: [unresolved / resolved / ignored]; first seen [date], last seen [date]; [N] events, [M] users
- **Divergence verdict:** [`aligned` — latest events match the title | `diverged` — original `<A>` vs. latest `<B>`]
- **Latest-10 signature distribution** (only when diverged):

  | Signature (exception @ file:line :: message) | Events (of 10) | First / last in window | Title's error? |
  |----------------------------------------------|----------------|------------------------|----------------|
  | `<TypeError @ Foo.php:88 :: ...>` | [n] | [date / date] | no — **current** |
  | `<RuntimeException @ Bar.php:101 :: ...>` | [n] | [date / date] | yes — original |

- **Fix target:** [which signature the dispatch addresses, and what happens to the other — folded in, or split into a new issue]
- **Traced current error:** `path/to/file.php:NN` (verified in Phase 4)

## 5. Feasibility Assessment

### 5.1 Current State
[What the system does today for this feature area]

### 5.2 Required Changes
- [ ] Change 1: [description]
- [ ] Change 2: [description]

### 5.3 Complexity: [Low / Medium / High / Very High]
[1-2 sentence justification]

### 5.4 Risks
1. **Risk**: [description] | **Mitigation**: [approach]

### 5.5 Dependencies
- [Dependency / blocker and its status — carrying open blockers from Section 2.4]

### 5.6 Production Validation
[Only when production-DB validation ran. One line per finding — minimal result, no raw rows — each citing the query that produced it:]
- [Finding] `(verified — production DB, YYYY-MM-DD)` — via `SELECT ...`

### 5.7 Solution Clarity: [Clear / Needs Design Exploration]
[1-2 sentence justification tied to evidence in Sections 4.3, 5.2, and 6. Rubric:]

| Rating | Criteria |
|--------|----------|
| **Clear** | Required Changes (5.2) lists concrete action verbs — no "TBD", "depends on...", or "need to decide"; Code Path Trace (4.3) is complete from controller to DB; Implementation Guidance (6) reads as a recipe a developer could follow without architectural decisions. |
| **Needs Design Exploration** | Required Changes contains open architectural choices (e.g., "either extend X or add new Y"); Code Path Trace has gaps or competing alternative paths; Implementation Guidance would need DDD lanes — bounded context placement, aggregate shape, event design — resolved before code can be written. |

Solution Clarity is independent of Complexity. A Low-complexity change can require Design Exploration ("change one config value, but which one and in which bounded context?"); a Very-High-complexity change can be Clear ("migrate 12 controllers to the new pagination pattern — laborious, recipe is solid").

### 5.8 Confidence: [High / Medium / Low]
[1-2 sentence justification tied to evidence. When below High, name the lever — the specific evidence that would raise it:]
> Would be High if [specific evidence, e.g. "production confirms `invoice_config` has a row for account 4471"].

[A `diverged` Sentry verdict (4.6) caps Confidence below High until both signatures are traced and the fix target is named — until then, the report cannot honestly claim it knows which error to fix.]

## 6. Implementation Guidance

[High-level approach for the implementation agent:]
1. Step one
2. Step two
3. Step three

[Recommended patterns to follow, existing code to reference]

## 7. Verified Code References

All references below have been verified by reading the actual files:

- `path/to/file.php:123` - [description] (verified)
- `path/to/file.php:456` - [description] (verified)

## 8. Unresolved Questions

Questions requiring stakeholder input before implementation. These feed Gate A of Section 9 — when non-empty, the waterfall dispatches to `/linear-clarify`.

1. [Question about unclear requirement]
2. [Question about business logic]
3. [Question about edge case handling]

## 9. Next Step

A deterministic waterfall to the single next skill to invoke. Run gates A through D in order — stop at the first gate that fires. Each gate maps to a field in this report, so the dispatch is mechanical, not a judgment call.

### A. Open author questions? (Section 8 non-empty)

→ **`/linear-clarify $ARGUMENTS`** — draft a single English clarification comment for the issue author, show for approval, then post via `mcp__linear-server__save_comment` on this issue. After the author replies, re-run `/linear-deep-analysis $ARGUMENTS` and re-enter this waterfall. Section 8 should now be empty (or shorter), Section 5.8 Confidence should rise, and the flow continues from Gate B.

### B. Confidence < High? (Section 5.8)

→ **Pull the lever named in 5.8.** No skill dispatch — this is an internal action: run the production DB validation, re-verify the cited code path, or close whatever specific evidence gap 5.8 named. Then re-rate Confidence and re-enter the waterfall from Gate A.

### C. Solution Clarity = "Needs Design Exploration"? (Section 5.7)

→ **`/grill-me`** — stress-test the design using this report as the input context. Outputs a Grill Summary that pins bounded-context placement, aggregate shape, and trade-off rejections before any code is written. From the Grill Summary, the natural next step is Gate D below.

### D. Complexity + PRD-parent check (Section 5.3 + Section 2.4 `parent_is_prd`)

This gate is PRD-aware. The dispatch depends on **both** the complexity rating and whether the issue's parent is already a PRD.

- **Open blocker present** (Section 5.5 lists an open `blocked by` issue) → **refuse to dispatch** even at Low complexity. Implementing on top of an open blocker is wasted work. Tell the user to resolve the blocker first, or revisit this gate when it closes.
- **`parent_is_prd: true`** → **`/do-task`**, regardless of complexity. The PRD already exists as the parent issue; passing its content + this report as input context is sufficient. Re-running `/write-a-prd` here would duplicate or drift from the parent.
- **`parent_is_prd: false`** **AND** complexity = **Low** → **`/do-task`** — implement directly from this report. The report is the spec; no PRD needed for a copy-existing-pattern change.
- **`parent_is_prd: false`** **AND** complexity = **Medium / High / Very High** → **`/write-a-prd`** — formalize the report into a Linear-ready PRD before decomposing into slices. The PRD step is what keeps a multi-module change from drifting during implementation.

### Override: non-DDD legacy area

If the affected code is non-DDD legacy (no aggregates, no application services, controllers calling repositories directly) **and** this change introduces new behavior — not a bug fix — prefer `/grill-me` regardless of the gates above. The grill will surface a `plan-ddd-wedge` dispatch so the team can plan an ACL boundary alongside the feature instead of widening the legacy surface.

### Pointer to the full Medine workflow

This section dispatches to exactly one next skill. The full pipeline — PRD → `/prd-to-issues` → Subissue loop → `/do-task` → `/intensive-tester-fixer` → `/create-pr` → `/manual-qa` → Subdefect loop → close — lives in `docs/medine-workflow.md`. The dispatched skill carries the work from here; this report's job ends at the first dispatch.
```

---

## Section Guidelines

| Section | Length | Focus |
|---------|--------|-------|
| Executive Summary | 3-5 sentences + confidence | Decision-maker overview |
| Issue Analysis | Half page | Clarity on what's needed (2.1-2.3) + Linear-structural ground truth (2.4) |
| Attachments | Table only | Quick reference |
| Codebase Mapping | As needed | Technical accuracy; includes 4.4 local-DB, 4.5 UI, and 4.6 Sentry event analysis when those phases ran |
| Feasibility | Half page | Actionable assessment + Complexity (5.3) + Solution Clarity (5.7) + Confidence (5.8) |
| Implementation | Bullet points | Technical "how" |
| Code References | List only | Verified links |
| Questions | Numbered list | Blockers to resolve — feed Gate A |
| Next Step | Waterfall (A–D + override) | Single deterministic dispatch to the next skill, PRD-aware at Gate D |
