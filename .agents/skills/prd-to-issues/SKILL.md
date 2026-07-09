---
name: prd-to-issues
description: >-
  Decompose a Product Requirements Document into vertically sliced Linear
  sub-issues with blocking relationships, acceptance criteria, and AFK/HITL
  classification. Takes a PRD from a Linear issue, the current conversation
  (warm handoff from write-a-prd), or a file path, then produces self-contained
  implementation issues ready for agent execution via do-task. Use when the user
  wants to break down a PRD, create issues from a spec, decompose requirements
  into tasks, plan implementation slices, or turn a PRD into a work plan. Make
  sure to use this skill whenever the user mentions breaking down a PRD, creating
  implementation tasks, decomposing features into issues, or wants to go from
  requirements to a Kanban board — even if they don't say "prd-to-issues"
  explicitly.
user-invocable: true
license: MIT
metadata:
  author: medine-tech
  version: "1.0.0"
---

# PRD to Issues

Decompose a PRD into independently-grabbable Linear sub-issues. Each issue is a vertical slice that cuts through all layers end-to-end, self-contained enough for an agent (or human) to implement without reading the full PRD.

This skill sits between `write-a-prd` (which describes the destination) and `do-task` (which builds each slice). PRDs describe what the system looks like when done; this skill describes the journey -- the ordered sequence of thin, demoable increments that get there.

## Project Conventions

Before applying this skill, read the project's root `AGENTS.md` and any
`docs/*.md` files it indexes that are relevant to this task. Project-specific
conventions override this skill's generic defaults; when they conflict,
the project wins and the skill records the override in the output.

## Phase 1: Acquire PRD

Before asking the user anything, find and absorb the PRD autonomously.

### 1a. Detect Input

Try these detection paths in order:

1. **Conversation PRD (warm handoff):** Scan the current conversation for PRD structure -- look for `### Problem`, `### Outcome`, `### Requirements`, or `### Implementation Slices` sections. If found, extract the full PRD content. Tell the user: "I found a PRD for [Feature Name] in our conversation. I'll use it as the source."

2. **Linear issue ID:** If the user provides an issue ID (pattern like `CSU-42`, `PLI-118`), fetch it via `linear issue view <ID> --json`. Extract the description as PRD content. Record the ID as the parent issue. Note the team for sub-issue creation.

3. **File path:** If the user provides a path, read the file directly.

If none of these yield a PRD, ask: "I need a PRD to decompose. You can provide a Linear issue ID, paste the PRD here, or give me a file path."

### 1b. Extract PRD Sections

Parse the PRD and extract:
- **Implementation Slices** (if present) -- these are the starting point for decomposition
- **Requirements** -- verifiable behaviors that must be covered across slices
- **State Coverage** table -- happy path, error, empty, loading, edge cases to distribute across slices
- **Open Questions** -- items marked `[OPEN]` that affect slice classification (HITL)
- **Data Model / Contracts** -- entities and API shapes that inform technical checklists
- **Non-Goals** -- these become per-issue Out of Scope boundaries

### 1c. Explore the Codebase

Use `codebase-retrieval`, `Glob`, and `Grep` to discover:
- Domain models, naming conventions, and directory structure relevant to the feature
- Existing patterns the feature should follow or extend
- Test patterns (where tests live, what framework, naming conventions)

The goal is **ubiquitous language**: issue descriptions must use the exact terminology from the codebase. If the codebase calls it a `CourseWriteService`, the issue calls it a `CourseWriteService`.

### 1d. Record Parent Context

- If the PRD came from a **Linear issue**: record the issue ID (parent for sub-issues) and team
- If the PRD came from **conversation or file**: note that a parent issue will need to be created or provided in Phase 4

## Phase 2: Decompose into Slices

Read `references/issue-template.md` for the per-issue description template.

### Path A: PRD Has Implementation Slices (Warm Start)

The PRD already contains ordered slices with acceptance criteria. Enrich each slice rather than regenerating -- the PRD author made deliberate ordering and scoping decisions.

For each slice:
1. Expand brief acceptance criteria into full Given/When/Then format
2. Add the specific state coverage rows (error, empty, loading) that apply to this slice
3. Generate a technical checklist by cross-referencing codebase exploration (which files to modify, which patterns to follow, which tests to write)
4. Derive the Out of Scope section from neighboring slices
5. Add test notes (unit, integration, acceptance guidance)

### Path B: PRD Lacks Implementation Slices (Cold Start)

Generate slices from the Requirements, State Coverage, and Data Model sections:
1. Group requirements into end-to-end behaviors (each touching UI + API + domain + persistence where applicable)
2. Order by dependency -- **tracer bullet first** (the thinnest slice that proves the architecture works end-to-end with minimal business logic)
3. Apply the same enrichment as Path A

### For Both Paths

After generating slice details:

**Identify dependencies.** The tracer bullet (Slice 1) typically blocks subsequent slices. Mark explicit `blocked-by` relationships. If two slices heavily modify the same files, sequence them to avoid merge conflicts.

**Classify AFK vs HITL.** Each slice gets one tag:
- **AFK** (autonomous): All acceptance criteria are concrete, no `[OPEN]` questions, no taste decisions. An agent can implement this via `do-task` without human involvement.
- **HITL** (human-in-the-loop): Requires design choices (UI layout, UX flow), external service setup, or resolving open questions from the PRD.

**Assign estimates.** Use Linear's sizing scale: XS, S, M, L, XL. If a slice lands at L or larger, flag it as a candidate for splitting.

**Derive Out of Scope per issue.** Each issue's Out of Scope section explicitly names what neighboring slices handle. This prevents implementing agents from scope-creeping into adjacent work.

## Phase 3: Review with User

Present the full breakdown for review. The user should see the big picture before any issues are created in Linear.

### Dependency Graph

Show a text tree with order, tags, estimates, and blocking relationships:

```
1. [AFK] Slice 1: {title} (S) -- tracer bullet
   2. [AFK] Slice 2: {title} (M) -- blocked by #1
   3. [HITL] Slice 3: {title} (M) -- blocked by #1
      4. [AFK] Slice 4: {title} (S) -- blocked by #2, #3
```

### Issue Details

For each slice, show: title, 1-sentence context, acceptance criteria count, estimate, AFK/HITL, and blocked-by.

### User Interaction

Ask: **"Review the breakdown. You can: reorder, merge, split, adjust sizes, change AFK/HITL tags, or say 'ship it' to create in Linear."**

Use the **"Propose > Inquire"** pattern for adjustments:
- User says "too many issues" -- propose specific merges with reasoning
- User says "slice 3 is too big" -- propose a specific split
- User says "move X before Y" -- adjust the dependency graph and re-present

Iterate until the user says "ship it."

## Phase 4: Publish to Linear

Read `references/linear-commands.md` for the exact command patterns.

### Step 1: Ensure Parent Issue

- **PRD from Linear issue:** Use the recorded issue ID as parent
- **PRD from conversation/file:** Ask the user: "Provide a Linear issue ID to use as the parent, or I'll create one."
  - If creating: `linear issue create --title "{Feature Name}" --description-file /tmp/prd-parent.md --assignee self -s backlog`

### Step 2: Create Sub-Issues (Dependency Order)

Create issues in topological order -- blockers first so their IDs exist for the relation pass.

For each slice:
1. Write the issue description (from the template) to `/tmp/slice-{n}.md`
2. Create the issue:
   ```bash
   linear issue create \
     --title "{Imperative title}" \
     --description-file /tmp/slice-{n}.md \
     --parent {PARENT-ID} \
     --estimate {SIZE} \
     --assignee self \
     -s backlog \
     --label {AFK|HITL} \
     --team {TEAM}
   ```
3. Capture the returned issue ID from CLI output

### Step 3: Add Relations (Separate Pass)

After ALL issues are created, add blocking relationships:
```bash
linear issue relation add {BLOCKED-ID} blocked-by {BLOCKER-ID}
```

This is a separate pass because `linear issue create` does not support relation flags. All issues must exist before relations can reference them.

### Step 4: Report Results

Present a summary table:

| # | ID | Title | Estimate | Blocked By | Type |
|---|-----|-------|----------|------------|------|
| 1 | CSU-101 | Slice 1: ... | S | -- | AFK |
| 2 | CSU-102 | Slice 2: ... | M | CSU-101 | AFK |

Report the parent issue ID and the total number of sub-issues created.

### Fallback

If the `linear` CLI fails at any point, present all issue descriptions as markdown code blocks the user can paste into Linear manually. Never block the workflow on CLI failures.

## Guidelines

**Enrich over regenerate.** If the PRD already has Implementation Slices, add depth to them -- don't throw them away and start over. The PRD author made deliberate ordering and scoping decisions during the write-a-prd process.

**Tracer bullet first.** Issue #1 always proves the architecture end-to-end with minimal business logic. This flushes out integration unknowns before committing to the full build.

**Context isolation (INVEST).** Each issue description is self-contained. An agent picking up any single issue can implement it without reading the full PRD or other issues. The issue links back to the parent PRD for context but never depends on it.

**No user stories.** Imperative titles, concrete behaviors. "Implement payment webhook handler" not "As a user, I want my payment to be processed."

**Checklists as progress rings.** Every `- [ ]` in a Linear description renders as an interactive progress indicator. Use them for acceptance criteria and technical steps.

**File-based publishing.** Always use `--description-file` for Linear CLI commands. Markdown content with backticks, newlines, and special characters breaks inline `--description` flags.

**Relations are a separate pass.** Create all issues first, then add `blocked-by` relations via `linear issue relation add`. The `issue create` command does not support relation flags.

**Ubiquitous language.** Use the codebase's exact terminology in issue descriptions -- class names, module paths, route patterns. Generic terms like "the service" create ambiguity for implementing agents.
