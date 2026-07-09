---
name: do-task
description: >-
  Coordinate a full development task by orchestrating architect, developer, and
  reviewer specialists through a plan-approve-implement-review pipeline. Use
  when the user wants to build a complete feature end-to-end, implement a task from
  requirements to reviewed code, or run the full plan-implement-review pipeline.
---

# Task Coordinator

Coordinate a full development task by orchestrating specialist skills through a 6-phase pipeline: analyze, plan, approve, implement, review, report. The ONLY user-facing output is the Phase 6 report — never write code yourself, never stop before Phase 6.

## Project Conventions

Before applying this skill, read the project's root `AGENTS.md` and any
`docs/*.md` files it indexes that are relevant to this task. Project-specific
conventions override this skill's generic defaults; when they conflict,
the project wins and the skill records the override in the output.

## Pipeline (6 phases — Phase 6 is the ONLY exit point)

1. Analyze → 2. Plan → 3. Approve (HARD STOP) → 4. Implement + Validate → 5. Review → 6. Report (END)

**The user sees ONLY the Phase 6 report.** Phases 1-5 produce internal tracking data. Never present results, declare completion, or stop before the Phase 6 report is composed and presented.

## Phase 1: Analyze Requirements

Start by understanding the task and classifying its scope.

**Delegate codebase discovery** to an Explore agent. Spawn an `Explore` agent (`subagent_type: "Explore"`) with a prompt that asks it to analyze the target project directory and return a structured summary. Read `references/orchestration-playbook.md` for the Explore Agent Prompt template. The orchestrator never calls `codebase-retrieval` or `Glob` directly.

The Explore agent returns:
- Tech stack: language(s), framework(s), ORM, package manager
- Architecture pattern: hexagonal, layered, MVC, App Router, Pages Router
- Directory structure: where backend and frontend code live
- Existing features: reference implementations to guide agents

**Classify scope** using the Explore agent's summary — this determines which architect/developer skills to activate:
- **Backend-only**: Task involves API endpoints, domain models, services, database, or server-side logic exclusively. No UI components, pages, or client-side code.
- **Frontend-only**: Task involves React components, pages, hooks, styling, or client-side state exclusively. No new API endpoints or domain model changes.
- **Full-stack**: Task requires both backend API changes and frontend UI changes. The backend defines the contract that the frontend consumes.

Read `references/orchestration-playbook.md` for the scope classification decision tree and examples.

**Detect Linear issue codes** in the task description (e.g., `CSU-312`, `PLI-45`). If a Linear issue code is present, record it — it feeds the autonomous-mode trigger check below (the orchestrator fetches the upstream issue to look for an ADR/PRD reference). The code follows the pattern `[A-Z]{2,5}-\d+`.

**Detect autonomous mode.** When the task carries a Linear issue code AND the issue's description (fetched via `linear issue view <code>`) references an ADR file path or a PRD section/file, run the pipeline in **autonomous mode**: skip the Phase 1 clarifying question, skip the Phase 3 plan-approval gate, auto-resolve Phase 5 max-iteration escalation as "Proceed as-is", and surface every soft signal in Phase 6's `### Autonomous Run Status` section. Otherwise run in **interactive mode** — every gate below stays active. Record the chosen mode in conversation so all later phases respect it. The upstream ADR or PRD is the approval artifact in autonomous mode; without one, the user must approve in Phase 3. See [ADR 0004](../../docs/adr/0004-subagent-runners-with-autonomous-mode.md).

**Detect reference documents** in the task description:
- **Explicit file paths**: If the task mentions file paths (`.md`, `.ts`, `.tsx`, `.py`, etc.), record them. If a referenced file is <= 200 lines, read and include its content inline in architect prompts under `## Reference Documents`. If > 200 lines, pass the path to architects with instructions to read it.
- **Existing research artifacts**: Check for files in `{project_path}/.agents/research/` with slugs matching task keywords. If found, include them as context.
- **Prototype references**: If the task mentions prototypes (e.g., "I prototyped this in src/payments/prototype.ts"), record the path for inclusion in architect and developer prompts under `## Prototype Context`.

**Ask one clarifying question if scope is genuinely ambiguous (interactive mode only).** In autonomous mode, never ask — make the call yourself, default to backend-only when truly stuck, and record the inferred classification in Phase 6. In interactive mode, only ask when the Explore agent's summary doesn't reveal the answer and the ambiguity would change which runner subagents to spawn. If the task mentions both "API" and "page", it's full-stack — don't ask.

**Output**: State the classified scope and the chosen mode (autonomous / interactive) with reason. List the architect/developer runner subagents that will be spawned (`backend-architect-runner`, `frontend-architect-runner`, `backend-developer-runner`, `frontend-developer-runner`, `reviewer-runner`), plus the orchestration subagents (Explore, Research, Validation). Summarize acceptance criteria extracted from the task description. Note the Linear issue code if detected (used to fetch the upstream Linear issue for the autonomous-mode trigger check). Note any external dependency signals for Phase 1b. List ingested reference documents and the upstream ADR/PRD link that triggered autonomous mode (if applicable).

### Phase 1b: Research (conditional)

**Condition**: Only execute if the Explore agent reports an external dependency that is NOT already integrated (SDK not installed OR no existing usage found in the codebase). If all detected services are already integrated (SDK installed AND existing usage found), skip to Phase 2.

**Steps:**
1. For each unintegrated external dependency, spawn a `general-purpose` agent (`mode: "bypassPermissions"`) with the Research Agent Prompt from `references/orchestration-playbook.md`
2. The agent uses WebSearch and WebFetch to gather current API documentation and writes findings to `{project_path}/.agents/research/{service-slug}-research.md`
3. The agent returns a concise summary (max 50 lines) for the orchestrator to pass to downstream agents

**Error handling**: Research is best-effort. If the agent fails, log the failure reason and proceed to Phase 2. Never retry, never block the pipeline on research.

**Output**: Research summary per service, or "Skipped — {reason}" (all services already integrated / no external dependencies detected / agent failure).

## Phase 2: Plan Architecture

Spawn the appropriate architect runner subagent based on scope classification. Use the `Agent` tool with the runner name. Each runner has the corresponding architect skill body preloaded as reference (via `skills: [<role>]`) and runs with `background: true` so it cannot interrupt the orchestrator with clarifying questions. The runner's fresh subagent context does not inherit the parent conversation, so the architect context block must be self-contained — pass it as the runner's initial prompt. See [ADR 0004](../../docs/adr/0004-subagent-runners-with-autonomous-mode.md).

**Runner selection:**
- Backend-only → `Agent(backend-architect-runner)`
- Frontend-only → `Agent(frontend-architect-runner)`
- Full-stack → spawn `backend-architect-runner` first, capture its returned plan, then spawn `frontend-architect-runner` with the backend plan included in the brief so its contract decisions can align. Sequential, not parallel — the backend defines truth and the frontend brief needs the implemented contract shape.

**Context block** — compose the architect context block in conversation, then pass it as the initial prompt of the `Agent(<role>-architect-runner)` call. Read `references/orchestration-playbook.md` for the exact context-block templates. Every architect context block must include:
1. The user's original task description
2. Codebase context discovered in Phase 1 (tech stack, architecture, directory structure)
3. The acceptance criteria
4. Any reference documents, prototype paths, or research summaries detected in Phase 1
5. Tech debt + test-first planning requirements (see below)

**Tech debt and test-first planning**: Every architect context block must include instructions to identify tech debt in the area being modified and plan classification-aware test-first discipline at the appropriate layer (feature → unit/component with infra/API mocked; bug → §4.3 red-test classification keyed off the diagnosed root cause, see [ADR 0007](../../docs/adr/0007-feature-stripe-and-red-test-bug-classification.md); refactor → characterization tests at the same layer that covers the refactored code). Classification is pinned to the user's framing — the architect asks ONE clarifying question on ambiguity and never reclassifies unilaterally. High-risk areas (auth, payments, PII, public API) get architect advisory only, never override. For legacy code without tests, architects plan characterization tests at the chosen layer before refactoring. The architect plan must include a **Tech Debt Impact** section. See `references/orchestration-playbook.md` for the exact test-first block in each architect template. Reference KB lessons: [KB: testing-introduction-and-best-practices], [KB: four-rules-of-simple-design], [KB: applied-solid-principles], [KB: atdd-practical-example-with-tdd] (inner TDD loop only).

**Full-stack consistency check**: If both architects ran, review both plans and verify:
- API contract alignment: endpoints, request/response shapes, and status codes match between plans
- Shared types: DTOs or interfaces referenced by both plans are consistent
- If there's a mismatch, note it and resolve by adjusting the frontend plan to match the backend contract (backend defines truth)

**Persist plans to disk**: After architect runners return plans, save them to the project for durable reference. Use the `Write` tool directly — the plan content is in the orchestrator's conversation context (returned as the runner's final message), so no subagent is needed for persistence. Read `references/orchestration-playbook.md` for the feature slug derivation algorithm and the YAML frontmatter shape.

1. Derive a feature slug from the task description: strip leading verbs (Add/Build/Implement/Create/Refactor), lowercase, replace spaces with hyphens, strip non-alphanumeric except hyphens, truncate to 50 chars. Fallback: `task-{YYYYMMDDHHmmss}`.
2. Use `Bash` with `mkdir -p {project_path}/.agents/plans/` to ensure the directory exists.
3. Use `Write` to save each plan file directly:
   - Backend-only → `{slug}-backend.md`
   - Frontend-only → `{slug}-frontend.md`
   - Full-stack → both `{slug}-backend.md` and `{slug}-frontend.md`
4. Each plan file contains YAML frontmatter (`feature`, `scope`, `side`, `revision: 1`, `created_at`, `updated_at`) followed by the raw architect plan output already captured in conversation.
5. On revision (rejection cycle, interactive mode only), re-write the same files with `revision` incremented and `updated_at` refreshed; preserve `created_at` from the existing file (read it first with `Read`).

**Hard-abort condition**: if either architect runner returns an empty plan (no actionable items, no file targets, no test strategy), abort the pipeline immediately with `### Autonomous Run Status: run-aborted` (autonomous mode) or surface the error to the user (interactive mode). Empty plan = pipeline broken, not risky work.

**Output**: The complete architecture plan(s) as returned by the architect runners. Note any consistency adjustments made. Plan files saved to `{project_path}/.agents/plans/`. In autonomous mode, proceed directly to Phase 4 (the upstream ADR/PRD is the approval artifact). In interactive mode, proceed to Phase 3 for user approval.

## Phase 3: Approve Plan (HARD STOP — interactive mode only)

**In autonomous mode, skip this entire phase.** The upstream ADR or PRD attached to the source Linear issue is the approval artifact. Record `Plan Approval: autonomous — upstream {ADR|PRD} <link>` in conversation for the Phase 6 report and proceed directly to Phase 4.

**In interactive mode**, present the architecture plan to the user for approval using Claude Code's native plan mode. **The developer runner must not be spawned until this phase completes and the user approves.**

**Why this phase is a hard stop in interactive mode:** `EnterPlanMode` transitions to plan mode where the user must explicitly approve or reject before execution continues. There is no auto-approve path. This is the mechanical guarantee that no code is written without user consent when no upstream spec exists.

**Steps:**
1. Call `EnterPlanMode` to enter plan mode
2. Write a concise plan summary to the plan file covering:
   - **Scope**: The classified scope from Phase 1
   - **Key decisions**: The most important architectural choices from Phase 2
   - **Files to create/modify**: Expected file changes grouped by category
   - **Test strategy**: What tests will be written and at what levels
   - **Pipeline phases**: All 7 phases with status — this is the execution checklist the orchestrator follows after approval (see template below)
3. Call `ExitPlanMode` — the user sees the plan and approves or rejects via Claude Code's plan UI

**If the user rejects the plan:**
1. Incorporate the user's feedback
2. For **minor adjustments** (naming, file location, test scope): adjust the plan directly and re-enter plan mode with `EnterPlanMode`/`ExitPlanMode`. After the plan is revised, re-run the Plan File Writing Procedure to overwrite plan files with updated content and increment the `revision` field in frontmatter.
3. For **architectural changes** (different patterns, different API shape): re-activate the relevant architect skill(s) with the feedback as a follow-up context block, then re-enter plan mode. After the revised plan is ready, re-run the Plan File Writing Procedure to overwrite plan files and increment `revision`.
4. For **scope changes** (backend-only → full-stack, or vice versa): reclassify scope and restart from Phase 2. If the scope change adds a new side (e.g., backend-only → full-stack), persist the new plan file in addition to updating the existing one.
5. Maximum **3 rejection cycles** — after 3 rejections, proceed with the latest version

**Output**: Approved plan ready for implementation. This output only exists after the user approves the plan.

## Phase 4: Implement

**Pre-condition check (interactive mode only):** If you have not completed the `EnterPlanMode`/`ExitPlanMode` cycle and received user approval, STOP. Go back to Phase 3. The developer runner must never be spawned in interactive mode without user approval. In autonomous mode, the upstream ADR/PRD is the approval — proceed.

**Pre-condition check (always):** Verify the target project directory exists and is readable. If missing, hard-abort with `### Autonomous Run Status: run-aborted — project directory not found` (autonomous mode) or surface to user (interactive mode).

Spawn the appropriate developer runner subagent. Use the `Agent` tool with the runner name. Each runner has the corresponding developer skill body preloaded and runs in `background: true` mode. The runner's fresh subagent context does not inherit the parent conversation — pass the developer context block (with the full architect plan) as the runner's initial prompt.

**Runner selection and ordering:**
- Backend-only → `Agent(backend-developer-runner)`
- Frontend-only → `Agent(frontend-developer-runner)`
- Full-stack → spawn `backend-developer-runner` FIRST, wait for it to return (files written, tests run), THEN spawn `frontend-developer-runner` with the backend plan plus an instruction to discover the implemented contract from the project directory. Sequential, not parallel — the frontend needs the implemented backend API to discover contracts.

**Context block** — compose the developer context block in conversation, then pass it as the initial prompt of the `Agent(<role>-developer-runner)` call. Read `references/orchestration-playbook.md` for the exact context-block templates. Every developer context block must include:
1. The user's original task description
2. The complete architecture plan from Phase 2 (paste the full plan text)
3. The target project directory path
4. For frontend-developer in full-stack tasks: instruction to discover the backend API contract from the implemented code, rather than relying on the plan alone
5. The test-first block (see below) and the database migration rule (backend only, see below)

**Test-first enforcement**: Every developer context block must include the test-first block from the playbook — a failing test at the chosen layer must exist before production code (feature → unit/component; bug → §4.3 layer; refactor → same layer), with a one-line justify-or-test justification replacing the red test when a bug's §4.3 class routes out of automated testing (visual/UX, or misuse with no assertable rule), characterization tests for legacy code, red-green-refactor cycle at the chosen layer. See `references/orchestration-playbook.md` for the exact test-first block in each developer template.

**Database migration rule**: Backend developer context blocks must include the migration datetime rule — migration filenames use `YYYYMMDDHHmmss` format (full datetime with seconds). This prevents ordering conflicts when multiple developers generate migrations concurrently.

**Output (internal tracking only)**: Record what each developer runner built — files created/modified, tests written, test results, returned summary. Do NOT present this to the user.

**Hard-abort on empty diff**: After each developer runner returns, run `git diff --stat` in the target project directory. If the diff is empty (no files modified), abort with `### Autonomous Run Status: run-aborted — empty developer diff` (autonomous mode) or surface to user (interactive mode). Empty diff = the runner produced no work product.

**Post-Implementation Validation**: After each developer runner finishes (and the diff is non-empty), verify that all plan items were actually implemented before proceeding. Read `references/orchestration-playbook.md` for the Validation Agent Prompt and Completion Developer Prompt templates.

1. Spawn an `Explore` agent (`subagent_type: "Explore"`) with the full architect plan and instruct it to check each plan item against the codebase using `codebase-retrieval`. The agent returns a checklist: DONE / PARTIAL / MISSING with evidence for each item.
2. If all items are DONE → proceed.
3. If any items are PARTIAL or MISSING → re-spawn the developer runner (`Agent(backend-developer-runner)` or `Agent(frontend-developer-runner)`) with a follow-up brief that includes the checklist and instruction to complete only the missing items.
4. Re-validate after the developer completes. Maximum **2 validation-fix cycles** per side.
5. If items remain incomplete after 2 cycles → log as Open Items and proceed (Phase 6 reports `partial-implementation`).

**Full-stack validation sequencing**: Validate backend before spawning the frontend developer runner. Validate frontend before proceeding to Phase 5.

**Error handling**: If the validation agent fails, skip validation and proceed — validation is best-effort. Log the failure reason for the final report.

**→ Phase 4 complete. Proceed to Phase 5: Review NOW. Do not present implementation results to the user.**

## Phase 5: Review

Spawn the `reviewer-runner` subagent. Use `Agent(reviewer-runner)`. The runner has the `reviewer` skill body preloaded and runs in `background: true` mode. The runner runs `git diff` itself in the target project directory to capture the changes.

**Gather review context** — before spawning the runner:
1. Collect the acceptance criteria from Phase 1
2. Collect the architecture plan(s) from Phase 2

**Context block** — compose the reviewer context block in conversation, then pass it as the initial prompt of the `Agent(reviewer-runner)` call. Read `references/orchestration-playbook.md` for the exact context-block template. Every reviewer context block must include:
1. The acceptance criteria
2. The architecture plan(s) for conformance checking
3. The target project directory path
4. Instruction to run `git diff` to capture all changes

**Handle findings — automatic fix-review loop (max 3 iterations):**

The reviewer context block must include test-first verification instructions: verify a failing test at the chosen layer (feature → unit/component; bug → §4.3 layer; refactor → same layer) existed before production code — or a one-line justify-or-test justification when a bug's §4.3 class routes out of automated testing — verify characterization tests for legacy code refactors, verify migration filenames use `YYYYMMDDHHmmss` format, and check that red-green-refactor discipline was followed at the chosen layer. Correct feature implementations with only unit/component tests must NOT be flagged. See items 7-10 in the Reviewer Context Block in `references/orchestration-playbook.md`.

If the reviewer reports **no Critical or Major findings**: proceed to Phase 6 (Report).

If the reviewer reports **Critical or Major findings**, enter the fix-review loop:

1. **Fix**: Re-spawn the appropriate developer runner (`Agent(backend-developer-runner)` or `Agent(frontend-developer-runner)`) with a fix-context block as the runner's initial prompt that includes:
   - The reviewer's findings (full text, not summarized)
   - The original architecture plan for context
   - The specific files that need changes
   - Instruction: "Fix only the issues listed below. Do not refactor unrelated code."

2. **Re-review**: After the developer runner finishes, re-spawn `Agent(reviewer-runner)` with a re-review context block as initial prompt. The context block must include the original acceptance criteria, the architecture plan, AND the previous review's findings so the runner can verify they were addressed. The runner runs `git diff` itself to inspect the latest state.

3. **Repeat** steps 1-2 until the reviewer reports no Critical or Major findings, up to a maximum of **3 iterations**.

4. **Escalate** if issues persist after 3 iterations:
   - **In autonomous mode**: auto-resolve as "Proceed as-is". Record the iteration count and the remaining findings verbatim in conversation; they will appear in Phase 6 under `### Autonomous Run Status: findings-deferred` with the full finding list under `### Open Items`.
   - **In interactive mode**: present the remaining findings to the user using `AskUserQuestion` with options "Continue fixing" or "Proceed as-is". Include the iteration count and remaining findings in the question.

Track the iteration count and include it in the final report (Phase 6).

**Output**: The reviewer's final report, plus a summary of fix iterations if any occurred (iteration count, what was fixed per iteration).

**→ Phase 5 complete. Proceed to Phase 6: Report NOW.**

## Phase 6: Report (PIPELINE END)

The orchestrator composes the final report directly using the phase summaries that are already in conversation context — no subagent. Composing a structured report from in-context summaries is exactly the kind of work the orchestrator should do itself: every input (acceptance criteria from Phase 1, architecture plan key decisions from Phase 2, validation status from Phase 4b, reviewer findings from Phase 5) is already loaded, so delegating would mean shipping that context out and bringing the same content back as text.

Read `references/orchestration-playbook.md` for the Human QA Checklist derivation rules. The orchestrator presents the composed report to the user as the ONLY user-facing output of the entire pipeline.

**Report structure** (use this template):

```
## Task Report: [Feature Name]

### Scope
[Backend-only / Frontend-only / Full-stack]

### What Was Built
[1-3 sentence summary of the delivered feature]

### Plan Approval
[Approved on first pass / Approved after N revision(s) — brief note on what changed if revised]

### Implementation Completeness
[Validation status: all items DONE / items needed completion cycles / items remaining PARTIAL or MISSING.
Include: validation cycle count per side, items that required re-implementation, any remaining incomplete items.
"All plan items verified complete" if no issues were found]

### Files Created/Modified
[List of files grouped by category: domain, application, infrastructure, tests]

### Architecture Decisions
[Key decisions from the architect plans — 2-4 bullet points]

### Tech Debt Impact
[Tech debt inventory from architect plan. Items classified as FIX_IN_THIS_TASK and their resolution status.
Items classified as PROPOSE_FOLLOW_UP with brief justification.
DDD/Hexagonal assessment: compliant / migration strategy applied.
"No tech debt identified" if the area was already clean]

### Test Coverage
[Classification (feature/bug/refactor), chosen layer, test types written at that layer, count, and pass/fail status. Deeper layers only if a bug reproduced there or a refactor's characterization lives there]

### Review Summary
[Overall assessment from the reviewer. List any Critical/Major findings and their resolution.
If fix-review iterations occurred, include: iteration count, findings per iteration, and final status]

### Strict Mode Compliance

| Gate | Status | Evidence |
|------|--------|----------|
| 1. Tech Debt Reduction | PASS/FAIL | [Brief evidence] |
| 2. Clean Code | PASS/FAIL | [Brief evidence] |
| 3. Test-First Discipline at Chosen Layer | PASS/FAIL | [Brief evidence] |
| 4. Test Pyramid | PASS/FAIL | [Brief evidence] |
| 5. Architecture Compliance | PASS/FAIL | [Brief evidence] |
| 6. Migration Strategies | PASS/FAIL | [Brief evidence] |

### Autonomous Run Status
[Single-line verdict, then a list of any deferred signals.

Verdict — one of:
- `clean` — autonomous run completed every phase with no soft escalations.
- `findings-deferred` — Phase 5 fix-review loop maxed at 3 iterations and auto-resolved "Proceed as-is"; remaining Critical/Major findings are listed under Open Items.
- `partial-implementation` — validation reported PARTIAL/MISSING items after 2 fix cycles, OR a runner subagent auto-denied an unpre-approved tool.
- `run-aborted` — one of the three hard-abort conditions fired: missing project directory, empty architect plan, or empty developer diff. Pipeline halted before Phase 6's full report could be composed; this section explains which.

For interactive runs, write `interactive — N/A` here. The section exists in both modes so a Phase 6 reader can scan once and know the mode.]

### Human QA Checklist
[Concrete, observable steps for manual verification. Derived from acceptance criteria, architecture plan, and reviewer findings.]

#### Setup
- [ ] {Preconditions: deploy to staging, seed test data, configure environment}

#### Happy Path
- [ ] {Step derived from acceptance criteria — e.g., "POST /enrollments with valid student and course IDs → expect 201 with enrollment ID"}
- [ ] {Additional success scenarios}

#### Error Cases
- [ ] {Step derived from error handling in architecture plan — e.g., "POST /enrollments for a full course → expect 409 with capacity error message"}
- [ ] {Steps derived from reviewer findings on error handling}

#### Edge Cases
- [ ] {Boundary conditions — e.g., "Enroll when course is at capacity-1, then enroll one more → expect success, then enroll again → expect rejection"}

#### Regression
- [ ] {Existing features that interact with the new code — e.g., "Verify GET /courses still returns correct enrollment count after new enrollments"}

*For backend-only tasks, steps use API calls (cURL examples). For frontend/full-stack tasks, steps are browser actions.*

**Re-entry**: If QA finds issues, create a follow-up task: `/do-task Fix the following QA findings from {feature}: {findings}`

### Open Items
[Any remaining work, known limitations, or follow-up tasks. "None" if the task is fully complete]
```

## Guidelines

**Pipeline completion is mandatory.** Execute all 6 phases in order. The ONLY output the user sees is the Phase 6 report. Never present an implementation summary, declare "done", or stop after Phase 4. Phases 5-6 are not optional — they run every time.

**One clarifying question, maximum.** Prefer inferring answers from the codebase over asking the user. The codebase is the source of truth for tech stack, architecture, and conventions.

**Plan approval is a hard stop in interactive mode.** When no upstream ADR/PRD is attached to the task, the developer runner must never be spawned before the user approves the plan. `EnterPlanMode`/`ExitPlanMode` creates a hard approval gate — the user must explicitly approve or reject before execution continues. In autonomous mode (Linear issue + ADR/PRD attached), Phase 3 is skipped because the upstream artifact is the approval, and the trade-off — a hallucinated plan ships straight to implementation — is mitigated by the reviewer runner in Phase 5 surfacing drift in the Phase 6 report.

**Delegate specialist work to runner subagents; keep orchestration in-thread.** Each of the five specialists (backend/frontend × architect/developer + reviewer) runs as a per-role runner subagent under `.claude/agents/<role>-runner.md` with the corresponding skill body preloaded (`skills: [<role>]`) and `background: true` set. The orchestrator spawns each runner with `Agent(<role>-runner)` and passes the role-specific context block as the runner's initial prompt. Three additional subagents handle high-noise work: Phase 1 Explore (codebase discovery), Phase 1b Research (WebSearch/WebFetch), and Phase 4b Validation. Everything else runs in-thread: plan persistence (`Write` calls) and the final Phase 6 report (templated composition from in-context summaries — the runner outputs are already in conversation as their final messages). The runner topology gives each specialist its own 200K context with independent auto-compaction, eliminates the 25K combined skill-body re-attachment budget that bottlenecked the prior in-thread topology, and mechanically suppresses `AskUserQuestion`-class stoppages mid-pipeline (background subagents auto-deny clarifying questions). See [ADR 0004](../../docs/adr/0004-subagent-runners-with-autonomous-mode.md) for the supersession of [ADR 0001](../../docs/adr/0001-skills-over-subagents-for-specialist-orchestration.md).

**Plans are contracts.** The architect's plan is the contract between planning and implementation. Pass it to the developer verbatim — don't summarize or reinterpret.

**Backend defines truth in full-stack.** When both backend and frontend plans exist, the backend API contract is authoritative. Adjust the frontend plan if there's a mismatch.

**Sequential within a slice.** Architects run sequentially in full-stack tasks (backend first; frontend brief includes the backend plan to align contract decisions). Developers run sequentially in full-stack tasks (backend first; frontend discovers the implemented contract from real code). The reviewer always runs after all developers complete. Cross-slice parallelism (multiple `do-task` invocations on independent slices from a `prd-to-issues` graph) is out of scope here — that is the issue-level concern, not the within-slice concern.

**Always review.** No task is too small to skip the review phase. The reviewer catches issues that developers miss.

**Test-first discipline at the chosen layer is mandatory.** Classification (feature/bug/refactor) is pinned to the user's framing. A failing test at the chosen layer (feature → unit/component; bug → §4.3 layer; refactor → same layer) must exist before production code — or a one-line justify-or-test justification when a bug's §4.3 class routes out of automated testing (visual/UX, misuse with no assertable rule). Architects plan the chosen layer, developers write the test first and follow red-green-refactor at that layer, and the reviewer verifies discipline at the chosen layer. Missing tests at the chosen layer are a Critical finding that triggers the fix-review loop. Correct feature implementations covered only by unit/component tests are NOT flagged.

**Migration filenames use full datetime with seconds.** Database migration files must follow `YYYYMMDDHHmmss` format (e.g., `20260303143022_create_enrollments.ts`). This prevents ordering conflicts when multiple developers generate migrations concurrently. The reviewer flags non-compliant filenames as Major.

## Strict Mode (Non-Negotiable)

These 7 rules are pipeline gates enforced across every phase. They are not conditional, not "when appropriate", and not optional.

1. **Each step must decrease tech debt.** The architect includes a Tech Debt Inventory (scan area, identify items, classify FIX_IN_THIS_TASK / PROPOSE_FOLLOW_UP). The developer reports items resolved. The reviewer verifies the area is cleaner than before. Tech debt increasing is a Critical finding; unchanged is Major.

2. **Clean code is mandatory.** All new code must use guard clauses (no nested if-else), operate at a single level of abstraction, use meaningful context-aware names, and contain no "what" comments. The reviewer gates violations as Major.

3. **Test-first discipline is mandatory.** A failing test at the chosen layer (feature → unit/component; bug → §4.3 layer; refactor → same layer) must exist before production code; for bugs whose §4.3 class routes out of automated testing (visual/UX, or misuse with no assertable rule), a one-line justify-or-test justification replaces the red test. Red-green-refactor enforced at that layer. Classification is pinned to the user's framing — agents never reclassify unilaterally. High-risk areas (auth, payments, PII, public API) get architect advisory only, never override. The architect defines the layer, the developer writes the failing test first, and the reviewer verifies test-before-code ordering at the chosen layer. Missing test at the chosen layer is a Critical finding.

4. **Test pyramid collapses to a single-layer stripe for features.** Feature work lives at unit/component (backend: use case with infra mocked; frontend: component with MSW-mocked API). Deeper layers (integration, acceptance, E2E) are reserved for bug/refactor flows whose characterization lives at that layer. First adapter bug in an unharnessed project → harness setup is a FIX_IN_THIS_TASK tech debt item. Bug-fix test layers follow the §4.3 classification table in [ADR 0007](../../docs/adr/0007-feature-stripe-and-red-test-bug-classification.md); visual/UX and misuse-without-a-rule bugs carry a justify-or-test justification instead of an automated test. Missing test at the chosen layer is a Critical finding; wrong layer selection is Major.

5. **DDD/Hexagonal is the target architecture.** New code follows DDD/hexagonal patterns (backend) or recommended frontend patterns. Non-DDD/non-compliant codebases get a Migration Strategy — concrete steps to move toward the target architecture within the task's scope.

6. **Bad practices require migration strategies.** Every identified anti-pattern must have either a fix in this task or a documented migration strategy with a follow-up task. Never "leave as-is" without justification.

7. **Strict mode verification is non-negotiable.** The reviewer verifies all 7 gates and produces a Strict Mode Compliance table (PASS/FAIL per gate). Any FAIL triggers the fix-review loop. The loop continues until all gates pass.

## Reference Documentation

- [Orchestration Playbook](references/orchestration-playbook.md) — Scope classification, agent prompt templates, plan approval flow, error recovery, plan consistency checklist
