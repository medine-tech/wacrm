---
name: write-a-prd
description: >-
  Generate a Linear-ready Product Requirements Document for a decided feature.
  Interviews the user with focused questions, explores the codebase for
  ubiquitous language and existing patterns, then produces a structured PRD
  with problem context, vertical implementation slices, state coverage, and
  observability decisions. Publishes directly to a Linear issue via the CLI.
  Scope is the PRD itself — does not decompose the PRD into sub-issues.
  Decomposition into implementation sub-issues belongs to the `prd-to-issues`
  skill; after publishing, this skill suggests that handoff but never creates
  sub-issues itself. Use when the user wants to write a PRD, create a spec,
  document requirements, formalize a feature decision, turn a grill-me session
  into a spec, or says "write a PRD", "create a spec", "document this feature",
  "turn this into requirements", "spec this out". Also use after grill-me or
  product-planning sessions when the user wants to formalize decisions into a
  Linear-ready document. Make sure to use this skill whenever the user mentions
  PRDs, product requirements, feature specs, writing up what we decided, or
  wants to capture a feature description for Linear — even if they don't say
  "PRD" explicitly.
user-invocable: true
license: MIT
metadata:
  author: medine-tech
  version: "1.0.0"
---

# Write a PRD

Generate a concise, actionable Product Requirements Document optimized for a Linear issue description. The PRD describes the destination (what the system looks like when done), not the journey (how to build it).

This skill fills the gap between design thinking and implementation: `grill-me` stress-tests the idea, `write-a-prd` formalizes the spec, `do-task` implements it.

## Project Conventions

Before applying this skill, read the project's root `AGENTS.md` and any
`docs/*.md` files it indexes that are relevant to this task. Project-specific
conventions override this skill's generic defaults; when they conflict,
the project wins and the skill records the override in the output.

## Phase 1: Gather Context

Before asking the user anything, build context autonomously. The user should not answer questions the codebase or conversation already answers.

### 1a. Detect Grill Summary

Scan the current conversation for a `## Grill Summary:` section (the structured output from grill-me Phase 4). If found, extract and map fields:

| Grill Summary Section | PRD Section |
|----------------------|-------------|
| Problem Statement | Problem |
| Agreed Design | Requirements (each decision becomes a verifiable requirement) |
| Data Model / Contracts | Data Model / Contracts |
| Key Risks and Mitigations | Risks |
| Unhappy Paths | State Coverage (error and edge-case rows) |
| Open Questions | Open Questions (preserve as `[OPEN]`) |
| Out of Scope | Non-Goals |

Tell the user what was absorbed: "I found a Grill Summary for [Feature Name]. I'll use it as the foundation — you'll confirm the details in a moment."

### 1b. Detect Linear Issue

If the user provides an issue ID (pattern like `CSU-42`, `PLI-118`), read it via `linear issue view <ID> --json` to get the current title, description, and status. Record the ID for the update flow in Phase 4.

### 1c. Explore the Codebase

Use `codebase-retrieval`, `Glob`, and `Grep` to discover:
- Tech stack, architecture style, directory structure
- Domain models and naming conventions relevant to the feature
- Existing patterns the feature should follow or extend

The goal is **ubiquitous language**: the PRD must use the exact terminology found in the code. If the codebase calls it a `CourseWriteService`, the PRD calls it a `CourseWriteService` — not "the service" or "the writing module."

### 1d. Read product.md

If `product.md` exists in the project root, read it for product vision, prior decisions, and deferred items. Reference relevant decisions in the PRD.

## Phase 2: Focused Interview

This skill drafts assumptions and asks the user to confirm — it does not interrogate relentlessly. The user's time is respected.

### With Grill Summary (warm start)

Present a 5-8 item confirmation checklist derived from the Grill Summary mapping. Each item states an assumption and asks the user to confirm, correct, or expand. The user already invested 16-50+ questions in grilling — do not re-ask what was resolved.

Add 2-3 questions for PRD-specific topics the grill session may not have covered:
- Appetite (time budget)
- Observability (feature flag, metrics) — if the feature is medium or large
- State completeness gaps (empty state, loading state)

### Without Grill Summary (cold start)

Present 8-12 focused questions using the **"Propose > Inquire"** pattern: lead with a recommendation based on what was discovered in Phase 1, then ask the user to confirm or adjust.

Topics to cover (skip what the codebase already answers):

1. **Problem and outcome** — What pain does this solve? What does success look like?
2. **Appetite** — How much time are we giving this? (constraint, not estimate)
3. **Non-goals** — What is explicitly out of scope? What rabbit holes should we avoid?
4. **Requirements** — What must the system do? (verifiable behaviors, not user stories)
5. **State coverage** — Happy path, empty state, loading state, error state
6. **Data model / contracts** — What entities or API shapes change?
7. **Observability** — Feature flag name? Key metrics? (for medium+ features)
8. **Dependencies / risks** — External systems, blocked teams, migration needs?

After the user responds, separate items into two buckets:
- **Confirmed**: becomes PRD content directly
- **Open**: marked `[OPEN]` in the PRD for later resolution

## Phase 3: Write the PRD

1. Read `references/prd-template.md` for the template structure.

2. **Classify feature complexity** to determine section depth:

   | Signal | Size | Sections to include |
   |--------|------|-------------------|
   | < 1 week, single slice | Small | `[required]` only |
   | 1-3 weeks, 2-4 slices | Medium | `[required]` + `[recommended]` |
   | 3+ weeks, 5+ slices | Large | All sections |

3. Fill each section using confirmed assumptions, grill-me output, and codebase context.

4. **Implementation slices** follow the vertical slice pattern: each slice cuts through all layers (UI, API, domain, persistence) and is independently testable. Order slices by dependency. Never slice horizontally ("build the whole DB, then the API, then the UI").

5. Use `- [ ]` checklists for requirements, acceptance criteria, and open questions. Linear renders these as interactive progress rings.

6. Present the complete PRD to the user inside a markdown code block for easy copying.

7. Ask: **"Review the PRD. Tell me what to change, or say 'ship it' to publish to Linear."**

## Phase 4: Publish to Linear

When the user approves, write the PRD to a temp file and publish via the Linear CLI.

**Create new issue** (no issue ID detected):
```bash
cat > /tmp/prd-<slug>.md <<'EOF'
<PRD content>
EOF
linear issue create --title "<Feature Name>" --description-file /tmp/prd-<slug>.md --assignee self
```

**Update existing issue** (issue ID detected in Phase 1):
```bash
cat > /tmp/prd-<slug>.md <<'EOF'
<PRD content>
EOF
linear issue update <ISSUE-ID> --description-file /tmp/prd-<slug>.md
```

After publishing, report the issue ID and URL.

### Suggest Decomposition

After the PRD is successfully published to Linear, print a single-line handoff:

> "PRD shipped. Want to break it into implementation sub-issues? Run `/prd-to-issues` — it'll pick up this PRD from the conversation."

Do not create sub-issues from this skill. Decomposition (slice enrichment, AFK/HITL classification, dependency graph, blocking relations) is owned by `prd-to-issues`. Suggest the handoff; never invoke `linear issue create --parent` or `--blocked-by` from here.

### Fallback

If the `linear` CLI is not available or fails, present the PRD as markdown in the conversation and tell the user to paste it into Linear manually. Never block the workflow on CLI failures.

## Guidelines

**PRD describes the destination, not the journey.** Write what the system should do when complete. Implementation strategy belongs in architect plans, not the PRD. This keeps the PRD durable — it does not go stale when implementation diverges.

**Use the codebase's words.** If the codebase calls it a `CourseWriteService`, the PRD calls it a `CourseWriteService`. Generic terms like "the service" create ambiguity for implementing agents.

**No user stories.** "As a user, I want to..." is a Linear anti-pattern and performs poorly as agent context. Write concrete problems and measurable outcomes.

**Checklists become progress rings.** Every `- [ ]` in a Linear description renders as an interactive progress indicator. Use them for requirements, acceptance criteria, and implementation slices.

**Confirmed > Open.** Separate what is decided from what is not. Mark open questions explicitly with `[OPEN]` so implementing agents do not silently resolve them with assumptions.

**File-based publishing.** Always use `--description-file` for Linear CLI commands. This avoids shell escaping issues with markdown content containing backticks, newlines, and special characters.

**Adapt to feature size.** A dark-mode toggle does not need a Security section. A payment integration does. Skip sections that add no value — the template tags (`[required]`, `[recommended]`, `[large-only]`) guide this.
