# Orchestration Playbook

Reference guide for the do-task coordinator. Contains scope classification rules, agent prompt templates, error recovery strategies, and plan consistency checks.

## Scope Classification Decision Tree

```
Is the task about UI, components, pages, styling, or client-side state ONLY?
├── Yes → Frontend-only
└── No
    Is the task about API endpoints, domain models, services, database, or server-side logic ONLY?
    ├── Yes → Backend-only
    └── No
        Does the task require both API changes AND UI changes?
        ├── Yes → Full-stack
        └── No → Re-read the task. Default to backend-only if still unclear.
```

### Classification Examples

| Task Description | Scope | Reasoning |
|-----------------|-------|-----------|
| "Add a student enrollment API endpoint with capacity validation" | Backend-only | API endpoint + domain logic, no UI |
| "Create a product listing page with filtering and sorting" | Frontend-only | UI components + client-side state, API already exists |
| "Build an order checkout feature with payment processing" | Full-stack | Needs payment API + checkout UI |
| "Refactor the discount service to use polymorphism" | Backend-only | Service-layer restructuring, no UI impact |
| "Add dark mode to the dashboard" | Frontend-only | Styling + theme state, no API changes |
| "Implement user authentication with login page" | Full-stack | Auth API + login form UI |
| "Add unit tests to the CourseCreator use case" | Backend-only | Testing existing backend code |
| "Refactor the product card component to reduce re-renders" | Frontend-only | Component optimization, no API changes |

### Ambiguity Signals — When to Ask

Ask **one** clarifying question when:
- The task mentions a "feature" without specifying backend or frontend scope
- The codebase has both backend and frontend code, and the task could reasonably apply to either
- The task says "add X" where X could be a domain concept (backend) or a UI element (frontend)

Do NOT ask when:
- The task mentions both API/endpoint AND page/component → it's full-stack
- The task mentions only domain/service/repository terms → it's backend-only
- The task mentions only component/hook/page/style terms → it's frontend-only

## Agent and Skill-Context Templates

Three execution modes coexist in the pipeline:

- **Runner subagents via `Agent(<role>-runner)`** — the five specialists (backend/frontend architects, backend/frontend developers, reviewer). Each runner has the corresponding skill body preloaded (`skills: [<role>]`) and runs in `background: true` mode so it cannot interrupt the parent with clarifying questions. The templates below are **context blocks**: messages the orchestrator composes in conversation, then passes as the runner's initial prompt — the runner's fresh subagent context does not inherit the parent conversation, so the brief must be self-contained. See [ADR 0004](../../../docs/adr/0004-subagent-runners-with-autonomous-mode.md), which supersedes [ADR 0001](../../../docs/adr/0001-skills-over-subagents-for-specialist-orchestration.md).
- **In-thread orchestrator procedures** — plan persistence (Phase 2) and report composition (Phase 6). Their templates below are **procedures**: checklists the orchestrator follows directly, using `Write`/`Bash`/`Read` tools. No subagent — the inputs are already in conversation context (runner outputs return to the parent as final messages).
- **Helper subagent prompts** — Explore (Phase 1), Research (Phase 1b), Validation (Phase 4b) templates use the Agent tool with built-in `Explore` or `general-purpose` types because the work is high-noise exploration that returns a small structured summary. Distinct from the per-role runner subagents above.

### Explore Agent Prompt (Phase 1)

```
Analyze the codebase at {project_path} and return a structured summary for task planning.

## Task Context
{user_task_description}

## Required Analysis
Produce a structured summary (max 200 lines) covering:

### Tech Stack
- Language(s) and version(s)
- Framework(s) (Express, Next.js, etc.)
- ORM / database (TypeORM, Prisma, etc.)
- Package manager (npm, yarn, pnpm, bun)
- Test framework (Jest, Vitest, etc.)

### Architecture Pattern
- Pattern name (hexagonal, layered, MVC, App Router, Pages Router)
- Module structure (how code is organized by domain/feature)

### Directory Structure
- Backend code location (e.g., src/[module]/domain, src/[module]/application, src/[module]/infrastructure)
- Frontend code location (e.g., app/[route]/page.tsx, pages/)
- Test location (e.g., test/, __tests__/)
- Shared/infrastructure code location

### Existing Features
- List 2-3 existing features as reference implementations (entity + use case + controller + test)
- Note any patterns: object mothers, value objects, shared infrastructure

### Linear Issue Code
- If the task description contains a code matching `[A-Z]{2,5}-\d+` (e.g., CSU-312, PLI-45), extract and report it
- If none found, state "No Linear issue code detected"

### External Dependencies
- Scan the task description for external service names (Stripe, Twilio, SendGrid, Auth0, Firebase, AWS S3, Google Maps, etc.), URL references, and phrases like "integrate with", "using the X API", "connect to X"
- For each detected service:
  1. Check if an SDK is present in package.json (e.g., `stripe`, `twilio`, `@sendgrid/mail`, `@auth0/nextjs-auth0`)
  2. Search for existing usage in the codebase (e.g., `new Stripe(`, `import { Twilio }`)
  3. Report: service name, signal (phrase/URL that triggered detection), SDK status (installed/not installed), existing usage (found with file path / not found)
- If no external services are detected, state "No external dependencies detected"

### Reference Documents
- Scan the task description for file path references (paths ending in .md, .ts, .tsx, .py, .json, or similar code/doc extensions)
- Check for existing files in `{project_path}/.agents/research/` with slugs related to the task keywords
- Scan for prototype references (phrases like "I prototyped this in", "see my prototype at", "started implementing in")
- Report for each found reference: path, type (PRD/spec/research/prototype), line count (if file exists)
- If no references are detected, state "No reference documents detected"

## Instructions
1. Discover the project structure using Glob and file exploration
2. Focus on breadth over depth — identify patterns, don't read every file
3. Return ONLY the structured summary, no commentary
```

### Research Agent Prompt (Phase 1b — conditional)

```
You are a research agent. Investigate the external service below and produce a concise integration reference.

## Service
- **Name**: {service_name}
- **Signal**: {detection_signal}
- **SDK status**: {installed / not installed}
- **Existing usage**: {description or "none found"}

## Project Context
- **Project directory**: {project_path}
- **Tech stack**: {tech_stack}
- **Architecture**: {architecture_pattern}

## Required Sections (max 300 lines total)

### API Overview
- Authentication method (API key, OAuth, etc.) and where credentials are configured
- Base URL and API versioning
- Rate limits and retry strategy

### Relevant Endpoints / SDK Methods
- List only the endpoints or methods relevant to the task
- For each: HTTP method + path (or SDK method signature), key request parameters, response shape (TypeScript interface)

### SDK Installation and Setup
- Package name and install command
- Initialization snippet (client instantiation with config)
- Recommended version constraints

### Integration Pattern
- Where to place the integration code given the project's architecture (e.g., infrastructure adapter in hexagonal)
- Adapter interface suggestion that decouples domain from the external service
- Error mapping: how to translate API errors to domain errors

### Testing Strategy
- Mock/stub approach for unit tests (e.g., dependency injection of the adapter interface)
- Sandbox or test mode if the service provides one
- Key scenarios to test: success, auth failure, rate limit, network timeout

### Gotchas
- Common pitfalls, breaking changes in recent versions, or non-obvious behavior

## Instructions
1. Use WebSearch and WebFetch to find the service's current official documentation
2. Prioritize official docs, SDK README, and changelog over blog posts
3. Write findings to `{project_path}/.agents/research/{service_slug}-research.md`
4. Return a concise summary (max 50 lines) of key findings for the orchestrator
```

### Backend Architect Context Block (Phase 2 — `Agent(backend-architect-runner)`)

Compose this as a single message in conversation, then pass it as the initial prompt of `Agent(backend-architect-runner)`. The runner's preloaded `backend-architect` skill body sets the architect role; this block provides the task-specific brief.

```
## Backend Architecture Task

Plan the implementation for the following task.

## Task
{user_task_description}

## Codebase Context
- **Project directory**: {project_path}
- **Tech stack**: {tech_stack}
- **Architecture**: {architecture_pattern}
- **Directory structure**: {directory_structure}

## Acceptance Criteria
{acceptance_criteria}

{If research_context exists: "## Research Context\nResearch findings for {service_name} are available at `{project_path}/.agents/research/{service_slug}-research.md`.\n{If file < 200 lines, inline the content here. Otherwise: 'Read this file before planning the integration.'}\nKey points:\n{research_summary}"}

{If reference_documents exist: "## Reference Documents\n{For each document: '### {document_title}\nSource: `{file_path}`\n{If file <= 200 lines, inline content. Otherwise: 'Read this file for full requirements.'}'}"}

{If prototype_path exists: "## Prototype Context\nA prototype exists at `{prototype_path}`. Review it for implementation patterns and intent, but do not assume it follows the project's architecture conventions."}

## Tech Debt and Test Strategy Planning (MANDATORY — Strict Mode)

### Tech Debt Inventory
Scan the area being modified and produce an inventory:
1. Identify specific tech debt items — god classes, missing tests, tight coupling, primitive obsession, switch statements, anemic domain models, infrastructure leaks
2. Classify each item: **FIX_IN_THIS_TASK** (will be resolved) or **PROPOSE_FOLLOW_UP** (needs a follow-up task)
3. Cite the applicable KB lesson for each item [KB: applied-solid-principles] or [KB: clean-code]

### Tech Debt Reduction Plan
For every FIX_IN_THIS_TASK item, specify how it will be resolved during implementation. For every PROPOSE_FOLLOW_UP item, explain why it can't be fixed now and what the follow-up task should contain.

### Test Strategy (Classification-Aware)
Classification is user-framed. Never reclassify unilaterally; ask ONE clarifying question if framing is ambiguous.

1. **Classify the task** from the user's framing:
   - "add / new / improve / support" → **feature flow**
   - "fix / regression / broken / bug / error" → **bug flow**
   - "refactor / extract / rename / clean up" → **refactor flow**
   - "add tests to X" → **explicit test-coverage request**
2. **Pick the test layer per rule**:
   - **Feature** → unit tests only at the use case layer. Zero integration, zero acceptance, zero E2E — no exceptions for new adapters. [KB: unit-testing-and-test-pyramid]
   - **Bug** → §4.3 red-test classification (see ADR 0007): classify from the diagnosed root cause; red test at the lowest layer that reliably reproduces the bug — unit if observable with mocked infra; integration if real infra is required; acceptance/E2E only when multi-collaborator wiring is required, with written justification. Visual/UX and misuse §4.3 rows route out of automated testing via the justify-or-test hatch (a one-line written justification).
   - **Refactor** → same-layer rule: characterization tests at the same layer as the refactored code. No user approval required.
   - **Explicit test coverage** → at whatever layer X lives in.
3. **Document the chosen layer and rationale** in the plan's Testing Strategy section.
4. **High-risk advisory**: if the task touches auth / payments / PII / public API keywords, emit a one-line advisory like: "This touches payments; consider explicitly requesting acceptance test coverage if that's in scope." **Never unilaterally recommend deeper layers.** Only the user can authorize moving above the unit layer for features.
5. **Feature uncovering a latent bug**: note that the developer must stop the feature slice, run bug flow on the discovered bug first, then resume. Two commits.
6. **First adapter bug in an unharnessed project**: classify harness setup as `FIX_IN_THIS_TASK` tech debt.

Cite: [KB: test-structure-srp-and-given-when-then, test-doubles-and-maintainable-tests, unit-testing-and-test-pyramid, tdd-red-green-refactor-and-tcr, atdd-practical-example-with-tdd (inner TDD loop only; outer ATDD wrapper dropped as default)].

### DDD/Hexagonal Assessment
1. Assess current architecture compliance: domain layer separation, dependency inversion, aggregate boundaries
2. If compliant: note patterns in place and ensure new code follows them
3. If non-compliant: propose a **Migration Strategy** — concrete steps to move toward DDD/hexagonal within the task's scope
4. Never "leave as-is" — every anti-pattern must have either a fix or a documented migration strategy

Include a **Tech Debt Impact** section in the plan listing: inventory, resolution plan, and DDD/Hexagonal assessment.

## Database Migration Convention
If the task involves database migrations, use `YYYYMMDDHHmmss` format (full datetime with seconds) for migration filenames — this prevents ordering conflicts when multiple developers generate migrations concurrently.

## Instructions
1. Discover existing patterns and reference implementations in the project directory
2. Produce a complete implementation plan following the skill's 5-phase workflow
3. Ground every recommendation in a KB lesson with [KB: lesson-filename] citations
```

### Frontend Architect Context Block (Phase 2 — `Agent(frontend-architect-runner)`)

Compose this as a single message in conversation, then pass it as the initial prompt of `Agent(frontend-architect-runner)`. The runner's preloaded `frontend-architect` skill body sets the architect role; this block provides the task-specific brief.

```
## Frontend Architecture Task

Plan the implementation for the following task.

## Task
{user_task_description}

## Codebase Context
- **Project directory**: {project_path}
- **Tech stack**: {tech_stack}
- **Architecture**: {architecture_pattern}
- **Directory structure**: {directory_structure}

## Acceptance Criteria
{acceptance_criteria}

{If research_context exists: "## Research Context\nResearch findings for {service_name} are available at `{project_path}/.agents/research/{service_slug}-research.md`.\n{If file < 200 lines, inline the content here. Otherwise: 'Read this file before planning the integration.'}\nKey points:\n{research_summary}"}

{If reference_documents exist: "## Reference Documents\n{For each document: '### {document_title}\nSource: `{file_path}`\n{If file <= 200 lines, inline content. Otherwise: 'Read this file for full requirements.'}'}"}

{If prototype_path exists: "## Prototype Context\nA prototype exists at `{prototype_path}`. Review it for implementation patterns and intent, but do not assume it follows the project's architecture conventions."}

## Tech Debt and Test Strategy Planning (MANDATORY — Strict Mode)

### Tech Debt Inventory
Scan the area being modified and produce an inventory:
1. Identify specific tech debt items — component duplication, CSS shotgun surgery, missing Server/Client boundaries, prop drilling, barrel exports, missing tests, hardcoded values, fragile selectors
2. Classify each item: **FIX_IN_THIS_TASK** (will be resolved) or **PROPOSE_FOLLOW_UP** (needs a follow-up task)
3. Cite the applicable source for each item [KB: clean-code] or [Vercel: server-serialization]

### Tech Debt Reduction Plan
For every FIX_IN_THIS_TASK item, specify how it will be resolved during implementation. For every PROPOSE_FOLLOW_UP item, explain why it can't be fixed now and what the follow-up task should contain.

### Test Strategy (Classification-Aware)
Classification is user-framed. Never reclassify unilaterally; ask ONE clarifying question if framing is ambiguous.

1. **Classify the task** from the user's framing:
   - "add / new / improve / support" → **feature flow**
   - "fix / regression / broken / bug / error" → **bug flow**
   - "refactor / extract / rename / clean up" → **refactor flow**
   - "add tests to X" → **explicit test-coverage request**
2. **Pick the test layer per rule**:
   - **Feature** → component/unit tests only. Zero integration, zero acceptance, zero E2E — no exceptions for new integrations. [KB: unit-testing-and-test-pyramid]
   - **Bug** → §4.3 red-test classification (see ADR 0007): classify from the diagnosed root cause; red test at the lowest layer that reliably reproduces the bug — component/unit if observable in isolation; integration if real backend/browser APIs are required; acceptance/E2E only when multi-collaborator wiring is required, with written justification. Visual/UX and misuse §4.3 rows route out of automated testing via the justify-or-test hatch (a one-line written justification).
   - **Refactor** → same-layer rule: characterization tests at the same layer as the refactored code. No user approval required.
   - **Explicit test coverage** → at whatever layer X lives in.
3. **Document the chosen layer and rationale** in the plan's Testing Strategy section.
4. **High-risk advisory**: if the task touches auth / payments / PII / public API keywords, emit a one-line advisory like: "This touches payments; consider explicitly requesting acceptance test coverage if that's in scope." **Never unilaterally recommend deeper layers.** Only the user can authorize moving above the component/unit layer for features.
5. **Feature uncovering a latent bug**: note that the developer must stop the feature slice, run bug flow on the discovered bug first, then resume. Two commits.

Cite: [KB: test-structure-srp-and-given-when-then, test-doubles-and-maintainable-tests, unit-testing-and-test-pyramid, tdd-red-green-refactor-and-tcr, atdd-practical-example-with-tdd (inner TDD loop only; outer ATDD wrapper dropped as default)].

### Architecture Assessment
1. Assess current architecture compliance: Server Components default, proper client boundaries, feature-first organization, design tokens
2. If compliant: note patterns in place and ensure new code follows them
3. If anti-patterns found: propose a **Migration Strategy** — concrete steps to address anti-patterns within the task's scope
4. Never "leave as-is" — every anti-pattern must have either a fix or a documented migration strategy

Include a **Tech Debt Impact** section in the plan listing: inventory, resolution plan, and architecture assessment.

## Instructions
1. Discover existing patterns and reference implementations in the project directory
2. Produce a complete implementation plan following the skill's 5-phase workflow
3. Ground every recommendation in a KB source with [KB: lesson-filename], [Vercel: rule-filename], or [WDG: guideline-name] citations
```

### Backend Developer Context Block (Phase 4 — `Agent(backend-developer-runner)`)

Compose this as a single message in conversation, then pass it as the initial prompt of `Agent(backend-developer-runner)`. The runner's preloaded `backend-developer` skill body sets the developer role; this block provides the task brief plus the architect plan (which is the contract — pass verbatim, do not summarize).

```
## Backend Implementation Task

Implement the following task based on the architecture plan below.

## Task
{user_task_description}

## Architecture Plan
{backend_architect_plan}

## Codebase Context
- **Project directory**: {project_path}
- **Tech stack**: {tech_stack}

{If research_context exists: "## Research Context\nResearch findings for {service_name} are available at `{project_path}/.agents/research/{service_slug}-research.md`. Read this file before implementing any integration with {service_name}. Key points:\n{research_summary}"}

## Test-First Discipline (MANDATORY — Strict Mode)
- **Classification is user-framed.** "add/new/improve/support" → feature flow. "fix/regression/broken/bug/error" → bug flow. "refactor/extract/rename/clean up" → refactor flow. Ambiguous → ask ONE clarifying question. Never reclassify unilaterally.
- **Write a failing test at the chosen layer FIRST before production code** — define the behavior, watch it fail, then implement. The reviewer verifies test-before-code ordering at the chosen layer as a Critical gate [KB: tdd-red-green-refactor-and-tcr]
- **Feature flow → unit tests only** at the use case layer. Zero integration, zero acceptance, zero E2E — no exceptions for new adapters. Infrastructure adapters are written but not tested [KB: unit-testing-and-test-pyramid]
- **Bug flow → §4.3 red-test classification** (ADR 0007): classify from the diagnosed root cause; red test at the lowest layer that reliably reproduces the bug (unit / integration / acceptance with written justification). Visual/UX and misuse rows take the justify-or-test hatch — a one-line written justification instead of an automated test
- **Refactor flow → same-layer rule**: characterization tests at the same layer as the refactored code. No user approval required [KB: test-structure-srp-and-given-when-then]
- **Feature uncovering a latent bug** → stop the feature slice, run bug flow on the discovered bug first, then resume. Two commits, not blended.
- **First adapter bug in an unharnessed project** → record harness setup as `FIX_IN_THIS_TASK` tech debt
- Follow red-green-refactor at the chosen layer [KB: tdd-red-green-refactor-and-tcr]
- Mock only infrastructure ports. Never mock domain services [KB: test-doubles-and-maintainable-tests]
- Clean code principles are mandatory in all new code: guard clauses, single abstraction level, meaningful names, no "what" comments [KB: introduction-to-clean-code-and-refactoring-practices]
- Report tech debt items resolved (FIX_IN_THIS_TASK) and any new items discovered (PROPOSE_FOLLOW_UP)

## Database Migration Rule
- Migration filenames MUST use full datetime with seconds: `YYYYMMDDHHmmss` (e.g., `20260303143022_create_enrollments.ts`)
- Never use date-only or date-hour-minute formats — seconds prevent ordering conflicts when multiple developers generate migrations concurrently

## Instructions
1. Discover existing patterns and reference implementations in the project directory
2. Implement the feature following the architecture plan and the skill's 5-phase workflow
3. Write tests at the chosen layer per the classification routing (default: unit only for features)
4. Run the full test suite after implementation and report results
```

### Frontend Developer Context Block (Phase 4 — `Agent(frontend-developer-runner)`)

Compose this as a single message in conversation, then pass it as the initial prompt of `Agent(frontend-developer-runner)`. The runner's preloaded `frontend-developer` skill body sets the developer role; this block provides the task brief plus the architect plan (the contract — pass verbatim).

```
## Frontend Implementation Task

Implement the following task based on the architecture plan below.

## Task
{user_task_description}

## Architecture Plan
{frontend_architect_plan}

## Codebase Context
- **Project directory**: {project_path}
- **Tech stack**: {tech_stack}

## Backend API Contract
{If full-stack: "The backend API has been implemented. Discover the actual endpoints, request/response shapes, and status codes in the project directory. Do not rely solely on the architecture plan — verify against the implemented code."}
{If frontend-only: "The backend API already exists. Discover the available endpoints in the project directory."}

{If research_context exists: "## Research Context\nResearch findings for {service_name} are available at `{project_path}/.agents/research/{service_slug}-research.md`. Read this file before implementing any integration with {service_name}. Key points:\n{research_summary}"}

## Test-First Discipline (MANDATORY — Strict Mode)
- **Classification is user-framed.** "add/new/improve/support" → feature flow. "fix/regression/broken/bug/error" → bug flow. "refactor/extract/rename/clean up" → refactor flow. Ambiguous → ask ONE clarifying question. Never reclassify unilaterally.
- **Write a failing test at the chosen layer FIRST before production code** — define the behavior, watch it fail, then implement. The reviewer verifies test-before-code ordering at the chosen layer as a Critical gate [KB: tdd-red-green-refactor-and-tcr]
- **Feature flow → component/unit tests only**. Zero integration, zero acceptance, zero E2E — no exceptions for new integrations [KB: unit-testing-and-test-pyramid]
- **Bug flow → §4.3 red-test classification** (ADR 0007): classify from the diagnosed root cause; red test at the lowest layer that reliably reproduces the bug (component/unit / integration / acceptance with written justification). Visual/UX and misuse rows take the justify-or-test hatch — a one-line written justification instead of an automated test
- **Refactor flow → same-layer rule**: characterization tests at the same layer as the refactored code. No user approval required [KB: test-structure-srp-and-given-when-then]
- **Feature uncovering a latent bug** → stop the feature slice, run bug flow on the discovered bug first, then resume. Two commits, not blended.
- Follow red-green-refactor at the chosen layer [KB: tdd-red-green-refactor-and-tcr]
- Clean code principles are mandatory in all new code: guard clauses, single abstraction level, meaningful names, no "what" comments [KB: introduction-to-clean-code-and-refactoring-practices]
- Report tech debt items resolved (FIX_IN_THIS_TASK) and any new items discovered (PROPOSE_FOLLOW_UP)

## Instructions
1. Discover existing patterns and reference implementations in the project directory
2. Implement the feature following the architecture plan and the skill's 5-phase workflow
3. Write tests at the chosen layer per the classification routing (default: component/unit only for features)
4. Run the full test suite after implementation and report results
```

### Reviewer Context Block (Phase 5 — `Agent(reviewer-runner)`)

Compose this as a single message in conversation, then pass it as the initial prompt of `Agent(reviewer-runner)`. The runner's preloaded `reviewer` skill body sets the reviewer role and runs `git diff` itself in the target project directory; this block provides the task-specific brief.

```
## Code Review Task

Review the implementation in the project directory below.

## Acceptance Criteria
{acceptance_criteria}

## Architecture Plan
{combined_architecture_plans}

## Codebase Context
- **Project directory**: {project_path}
- **Tech stack**: {tech_stack}

## Instructions
1. Run `git diff` in the project directory to capture all changes made by the developer skills
2. Discover existing conventions and reference implementations in the project directory
3. Review the changes against the acceptance criteria and architecture plan
4. Assess both code quality and test quality
5. Produce a structured review report following the skill's phase workflow
6. Flag any Critical or Major findings prominently at the top of the report
7. Verify test-first discipline was followed: a failing test at the **chosen layer** exists and was written before production code. Confirm the layer matches the task classification (feature → unit only; bug → §4.3 layer; refactor → same layer as refactored code). For a bug whose §4.3 class routes out of automated testing (visual/UX, or misuse with no assertable rule), a one-line justify-or-test justification replaces the red test. Flag missing test-before-code (with no justification) as Critical [KB: tdd-red-green-refactor-and-tcr]
8. For refactors: verify same-layer characterization tests exist that lock previous behavior before changes were made [KB: test-structure-srp-and-given-when-then]
9. Verify database migration filenames use `YYYYMMDDHHmmss` format (full datetime with seconds). Flag date-only or missing-seconds formats as Major
10. Check that tests follow red-green-refactor discipline — tests should not be trivially passing stubs [KB: tdd-red-green-refactor-and-tcr]
11. **Strict Mode Gate 1 — Tech Debt Reduction**: Verify a tech debt inventory exists, FIX_IN_THIS_TASK items were resolved, and the area is cleaner than before. Critical if tech debt increased, Major if unchanged.
12. **Strict Mode Gate 2 — Clean Code**: Verify guard clauses, single abstraction level, meaningful names, no "what" comments in all new code. Major if violated.
13. **Strict Mode Gate 3 — Test-First Discipline at Chosen Layer**: Verify a failing test at the chosen layer (feature → unit; bug → §4.3 layer; refactor → same layer) existed before production code — or, for a bug whose §4.3 class routes out of automated testing (visual/UX, or misuse with no assertable rule), a one-line justify-or-test justification. Critical if missing or written at the wrong layer.
14. **Strict Mode Gate 4 — Test Pyramid**: Verify unit tests for every feature change; deeper layers only for bugs requiring real infra or refactors whose characterization lives at that layer. Bug-fix layers follow the §4.3 table in ADR 0007; visual/UX and misuse-without-a-rule bugs carry a justify-or-test justification instead of an automated test. Flag feature work with integration/acceptance/E2E tests (other than the first adapter bug harness case) as Major. Critical if feature unit tests missing.
15. **Strict Mode Gate 5 — Architecture Compliance**: Verify new code follows DDD/hexagonal (backend) or recommended patterns (frontend). Non-compliant areas must have a migration strategy. Major if violated.
16. **Strict Mode Gate 6 — Migration Strategies**: Verify every anti-pattern has a fix or documented strategy. Major if "leave as-is" without justification.
17. **Strict Mode Gate 7 — Compliance Summary**: Produce a Strict Mode Compliance table (PASS/FAIL per gate 1-6) in the review report. Any FAIL triggers the fix-review loop.
```

### Fix Developer Context Block (Phase 5 fix-review loop — re-spawn `Agent(<role>-developer-runner)`)

Compose this as a single message in conversation, then pass it as the initial prompt of a re-spawned `Agent(backend-developer-runner)` or `Agent(frontend-developer-runner)` to apply the fixes. The runner's preloaded developer skill body sets the role; this block scopes the work to the reviewer's findings only.

```
## Fix Task

Fix the issues identified by the code reviewer below.

## Reviewer Findings (Iteration {N})
{reviewer_findings_full_text}

## Architecture Plan (for context)
{architecture_plan}

## Affected Files
{list_of_files_with_issues}

## Codebase Context
- **Project directory**: {project_path}
- **Tech stack**: {tech_stack}

## Instructions
1. Fix ONLY the Critical and Major issues listed above. Do not refactor unrelated code.
2. For each finding, verify your fix addresses the specific observation and recommendation
3. If the reviewer flagged missing test-first ordering at the chosen layer (feature → unit; bug → §4.3 layer; refactor → same layer), write the failing test at that layer FIRST before fixing production code — follow red-green-refactor discipline [KB: tdd-red-green-refactor-and-tcr]
4. If the reviewer flagged migration filename format, rename the file to use `YYYYMMDDHHmmss` format with seconds
5. Run the full test suite after fixes and report results
6. If a fix requires changing test expectations, explain why the original test was wrong
```

### Re-Review Context Block (Phase 5 fix-review loop — re-spawn `Agent(reviewer-runner)`)

Compose this as a single message in conversation, then pass it as the initial prompt of a re-spawned `Agent(reviewer-runner)`. The runner's preloaded `reviewer` skill body sets the role and runs `git diff` itself; this block scopes the work to verifying the previous findings were addressed.

```
## Re-Review Task

This is a re-review after fixes were applied (iteration {N} of {max}).

## Previous Review Findings
{previous_review_findings}

## Acceptance Criteria
{acceptance_criteria}

## Architecture Plan
{combined_architecture_plans}

## Codebase Context
- **Project directory**: {project_path}
- **Tech stack**: {tech_stack}

## Instructions
1. Run `git diff` in the project directory to capture all current changes
2. Verify each previous Critical/Major finding has been addressed
3. Check that fixes did not introduce new Critical/Major issues
4. Produce a structured review report. For each previous finding, state: FIXED, PARTIALLY FIXED, or NOT FIXED
5. Flag any new Critical or Major findings prominently
```

## Plan Approval Flow

After architect agents complete (Phase 2), the coordinator presents the plan for user approval via `EnterPlanMode`/`ExitPlanMode` before spawning any developer agents.

### How Plan Approval Works

`EnterPlanMode`/`ExitPlanMode` creates a **hard approval gate** between planning and implementation. The user must explicitly approve or reject the plan — there is no auto-approve path.

1. **Call `EnterPlanMode`** — Transitions to plan mode.
2. **Write plan summary** — Using the Plan Summary Template below, write the plan to the plan file.
3. **Call `ExitPlanMode`** — The user sees the plan and can approve or reject.
4. **User responds:**
   - **Approves** → proceed to Phase 4 (Implementation)
   - **Rejects with feedback** → incorporate feedback, re-enter plan mode with `EnterPlanMode`/`ExitPlanMode`
   - **Cancels** → abort the pipeline

### Plan Summary Template

```
## Plan Summary

### Scope
{backend-only / frontend-only / full-stack}

### Key Decisions
- {Decision 1: e.g., "Hexagonal architecture with CourseEnrollment aggregate root"}
- {Decision 2: e.g., "Capacity validation in domain layer, not infrastructure"}
- {Decision 3: optional}

### Files to Create/Modify
**Domain**: {list of domain files}
**Application**: {list of use case / service files}
**Infrastructure**: {list of adapters, controllers, routes}
**Tests**: {list of test files}

### Test Strategy
{Test levels planned: unit, integration, acceptance. Key test scenarios.}

### Tech Debt Assessment
- **Identified**: {N items found in the area being modified}
- **FIX_IN_THIS_TASK**: {Items that will be resolved during implementation}
- **PROPOSE_FOLLOW_UP**: {Items deferred to follow-up tasks with justification}
- **Architecture**: {DDD/Hexagonal compliant / Migration strategy included}

### Strict Mode Compliance
- [x] Tech Debt Inventory included in architect plan
- [x] Test strategy classification-aware (feature → unit only; bug → §4.3 classification; refactor → same layer)
- [x] DDD/Hexagonal assessment completed
- [ ] Unit tests planned for every feature change; deeper layers only for bugs requiring real infra or refactors whose characterization lives at that layer
- [ ] Test-first discipline at chosen layer (failing test before production code)
- [ ] Migration strategies documented for all anti-patterns
- [ ] Reviewer will verify all 7 strict mode gates

### Pipeline Phases
All 6 phases execute after approval. This checklist is the execution contract:
1. [x] Analyze — {scope} (research: {completed for X / skipped / not needed})
2. [x] Plan — {architect agents used}
3. [x] Approve — awaiting approval
4. [ ] Implement — {developer agents and order, e.g., "backend-developer, then frontend-developer"}
5. [ ] Review — reviewer skill validates implementation
6. [ ] Report — compose final task report
```

### Handling Plan Rejection

| Rejection Type | Action |
|---------------|--------|
| **Minor adjustment** (naming, file location, test scope) | Adjust the plan directly and re-enter plan mode with `EnterPlanMode`/`ExitPlanMode` |
| **Architectural change** (different patterns, different API shape) | Re-spawn the relevant architect agent(s) with the user's feedback, then re-enter plan mode |
| **Scope change** (backend-only → full-stack, or vice versa) | Reclassify scope and restart from Phase 2 with correct agents |

Maximum **3 rejection cycles**. After 3 rejections, proceed with the latest version.

## Plan Persistence

After architect skills complete (Phase 2), the orchestrator persists plans to `{project_path}/.agents/plans/` for durable reference before entering plan approval. This is done in-thread with `Write`/`Bash`/`Read` tools — no subagent.

### Feature Slug Derivation

Strip leading verbs, lowercase, replace spaces with hyphens, strip non-alphanumeric except hyphens, truncate to 50 chars.

**Leading verbs to strip**: Add, Build, Implement, Create, Refactor

**Fallback**: `task-{YYYYMMDDHHmmss}` (when the result is empty or only hyphens)

| Task Description | Slug |
|-----------------|------|
| "Add student enrollment API" | `student-enrollment-api` |
| "Build a product catalog feature" | `a-product-catalog-feature` |
| "Implement user authentication with login page" | `user-authentication-with-login-page` |
| "Refactor the discount service to use polymorphism" | `the-discount-service-to-use-polymorphism` |
| "Create a health check endpoint" | `a-health-check-endpoint` |
| "Fix bug in payment processing" | `fix-bug-in-payment-processing` |

### Plan File YAML Frontmatter

```yaml
---
feature: "{feature slug}"
scope: "{backend-only / frontend-only / full-stack}"
side: "{backend / frontend}"
revision: 1
created_at: "{YYYY-MM-DDTHH:mm:ss}"
updated_at: "{YYYY-MM-DDTHH:mm:ss}"
---
```

### Plan File Writing Procedure

Followed by the orchestrator directly — no subagent. The plan content is already in conversation from the architect skills.

1. Use `Bash` with `mkdir -p {project_path}/.agents/plans/` to ensure the directory exists.
2. For each plan in conversation, use `Write` to create:
   - Backend plan → `{project_path}/.agents/plans/{feature_slug}-backend.md`
   - Frontend plan → `{project_path}/.agents/plans/{feature_slug}-frontend.md`
3. Each file must start with the YAML frontmatter shape documented above (`feature`, `scope`, `side`, `revision`, `created_at`, `updated_at`), followed by the raw architect plan output verbatim.
4. Use `date -u +%Y-%m-%dT%H:%M:%S` (or equivalent) to produce ISO timestamps for `created_at` and `updated_at` on first write.

### Update-on-Rejection Rules

When the user rejects a plan and it is revised:
1. Use `Read` to fetch the existing plan file's frontmatter and capture `created_at`.
2. Use `Write` to overwrite the file with `revision` incremented by 1, `created_at` preserved, and `updated_at` refreshed to a new ISO timestamp.
3. For scope changes that add a new side (e.g., backend-only → full-stack), `Write` the new file as `revision: 1` and update the existing one as above.

## Post-Implementation Validation

After each developer completes (Phase 4), validate that all architect plan items were actually implemented before proceeding.

### Validation Agent Prompt (Explore agent)

```
Validate implementation completeness against the architecture plan.

## Architecture Plan
{full_architect_plan}

## Codebase Context
- **Project directory**: {project_path}
- **Side**: {backend / frontend}

## Instructions
1. For each item in the architecture plan (files to create, classes to implement, tests to write, endpoints to add, etc.), check if it exists in the codebase
2. Return a checklist with one entry per plan item in this format:

### Validation Checklist

- [DONE] {plan item description} — {evidence: file path or code snippet found}
- [PARTIAL] {plan item description} — {what exists} / {what's missing}
- [MISSING] {plan item description} — {what was expected but not found}

### Summary
- Total items: {N}
- DONE: {N}
- PARTIAL: {N}
- MISSING: {N}

3. Be thorough — check every concrete deliverable in the plan (files, classes, methods, tests, migrations, routes)
4. Do NOT flag items the developer reasonably added beyond the plan (extra tests, helper utilities)
5. If the plan is non-enumerable (e.g., "refactor for readability"), check for the key structural changes instead
```

### Completion Developer Prompt

```
Complete the missing implementation items identified by the validation check.

## Validation Checklist
{validation_checklist}

## Architecture Plan (for context)
{full_architect_plan}

## Codebase Context
- **Project directory**: {project_path}
- **Tech stack**: {tech_stack}

## Instructions
1. Implement ONLY the items marked PARTIAL or MISSING in the checklist above
2. Do not refactor or modify items marked DONE
3. For PARTIAL items: complete the missing parts without rewriting what already exists
4. For MISSING items: implement from scratch following the architecture plan
5. Run the full test suite after completing all items and report results
```

### Validation Flow

```
Developer completes
├── Spawn Explore agent with architect plan → returns checklist
├── All DONE?
│   ├── Yes → Proceed (to next developer or Phase 5)
│   └── No (PARTIAL/MISSING items)
│       ├── Re-spawn developer with checklist (cycle 1)
│       ├── Re-validate with Explore agent
│       ├── All DONE?
│       │   ├── Yes → Proceed
│       │   └── No
│       │       ├── Re-spawn developer (cycle 2)
│       │       ├── Re-validate
│       │       ├── All DONE?
│       │       │   ├── Yes → Proceed
│       │       │   └── No → Log as Open Items, proceed
│       └── Max 2 cycles per side
├── Validation agent fails?
│   └── Skip validation, proceed (best-effort)
```

### Edge Cases

- **Non-enumerable plans** (e.g., "refactor for readability"): The validation agent checks for key structural changes mentioned in the plan rather than a strict item list. If the plan doesn't have concrete deliverables, validation may report all DONE.
- **Developer additions beyond plan**: Items the developer added that weren't in the plan (extra tests, utility helpers) are not flagged as unexpected — validation only checks for plan items.
- **Validation agent failure**: If the Explore agent errors or times out, skip validation and proceed to the next step. Log "Validation skipped — {reason}" for the final report.

## Error Recovery Decision Tree

```
Agent returned an error or incomplete result?
├── Architect agent failed
│   ├── Codebase discovery failed → Check project path is correct, retry with explicit directory
│   └── Plan is incomplete → Re-spawn with more specific codebase context
├── Plan rejected by user
│   ├── Minor adjustment → Adjust plan directly, re-enter plan mode via EnterPlanMode/ExitPlanMode
│   ├── Architectural change → Re-spawn architect(s) with feedback, re-enter plan mode
│   └── Scope change → Reclassify scope, restart from Phase 2
├── Developer agent failed
│   ├── Tests fail after implementation → Re-spawn developer with test failure output and instruction to fix
│   ├── Linter errors → Re-spawn developer with linter output and instruction to fix
│   └── Agent ran out of turns → Spawn a new developer agent with "continue implementing" + list of remaining work
├── Research agent failed (Phase 1b)
│   └── Log failure reason → Skip research, proceed to Phase 2. Never retry, never block.
├── Reviewer skill failed
│   └── Re-activate with a simpler scope (fewer files, focused diff)
└── Scope misclassification discovered mid-task
    └── Stop current phase. Reclassify scope. Restart from Phase 2 with correct agents.
```

### Recovery Rules

1. **Retry once, then escalate.** If an agent fails on the first attempt, retry with adjusted context. If it fails again, report the issue to the user and ask how to proceed.
2. **Never re-run the entire pipeline.** If a developer fails but the architect succeeded, keep the plan and only re-spawn the developer.
3. **Test failures are developer failures.** If tests fail after implementation, re-spawn the developer agent with the test output — don't ask the user to fix tests.
4. **Don't suppress reviewer findings.** If the reviewer finds issues, report them. Never skip findings to produce a "clean" report.
5. **Fix-review loop is automatic.** When the reviewer reports Critical or Major findings, automatically re-activate the developer skill with the findings and re-activate the reviewer skill. Do not ask the user until 3 iterations have been exhausted. Track iteration count for the final report.
6. **Plan rejection is not failure.** A rejected plan means the user wants adjustments — incorporate feedback and re-present. Only after 3 rejections should you proceed with the latest version.
7. **Test-first discipline is non-negotiable.** A failing test at the chosen layer (feature → unit; bug → §4.3 layer; refactor → same layer) must exist before production code — or a one-line justify-or-test justification when a bug's §4.3 class routes out of automated testing. The reviewer verifies test-first discipline at the chosen layer. If the reviewer flags missing or wrong-layer test-first ordering, the fix-review loop must address it before proceeding.

### Report Composition Procedure (Phase 6)

Followed by the orchestrator directly — no subagent. Every input (acceptance criteria from Phase 1, architecture plan key decisions from Phase 2, plan-approval cycle count from Phase 3, implementation summary from Phase 4, validation status from Phase 4b, reviewer findings from Phase 5) is already loaded in conversation context.

Compose a report using the template below. Be concise — use bullet points, not paragraphs.

For the Human QA Checklist section, derive steps from:
- **Happy Path**: from acceptance criteria (Phase 1)
- **Error Cases**: from error handling in architecture plan (Phase 2) + reviewer findings (Phase 5)
- **Edge Cases**: from boundary conditions identified in architecture plan
- **Regression**: from features that interact with modified/new code
- **Setup**: from preconditions in the architecture plan

For backend-only tasks, write steps as API calls with cURL examples. For frontend/full-stack tasks, write steps as browser actions.

Present the composed report directly to the user. This is the ONLY user-facing output of the entire pipeline.

## Report Template
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
"All plan items verified complete" if no issues were found. "Validation skipped — {reason}" if validation agent failed]

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
[Test types written (unit, integration, acceptance), count, and pass/fail status]

### Review Summary
[Overall assessment. List any Critical/Major findings and their resolution. Include iteration count if fix-review loop occurred]

### Strict Mode Compliance

| Gate | Status | Evidence |
|------|--------|----------|
| 1. Tech Debt Reduction | PASS/FAIL | [Brief evidence — inventory present, FIX_IN_THIS_TASK items resolved] |
| 2. Clean Code | PASS/FAIL | [Brief evidence — guard clauses, single abstraction level, meaningful names] |
| 3. Test-First Discipline at Chosen Layer | PASS/FAIL | [Brief evidence — failing test at chosen layer (feature → unit; bug → §4.3 layer; refactor → same layer) existed before production code, or a justify-or-test justification for a non-test §4.3 bug] |
| 4. Test Pyramid | PASS/FAIL | [Brief evidence — unit tests for every feature change; deeper layers only for bugs requiring real infra or refactors whose characterization lives at that layer] |
| 5. Architecture Compliance | PASS/FAIL | [Brief evidence] |
| 6. Migration Strategies | PASS/FAIL | [Brief evidence] |

### Human QA Checklist
[Concrete, observable steps for manual verification.]

#### Setup
- [ ] {Preconditions: deploy to staging, seed test data, configure environment}

#### Happy Path
- [ ] {Step derived from acceptance criteria — e.g., "POST /enrollments with valid data → expect 201 with enrollment ID"}

#### Error Cases
- [ ] {Step derived from error handling — e.g., "POST /enrollments for a full course → expect 409 with capacity error"}

#### Edge Cases
- [ ] {Boundary conditions — e.g., "Enroll at capacity-1, enroll once more → success, enroll again → rejection"}

#### Regression
- [ ] {Existing features that interact with new code — e.g., "GET /courses still returns correct enrollment count"}

**Re-entry**: `/do-task Fix the following QA findings from {feature}: {findings}`

### Open Items
[Any remaining work, known limitations, or follow-up tasks. "None" if fully complete]
```

## Plan Consistency Checklist (Full-Stack)

When both backend and frontend architect plans exist, verify alignment before proceeding to implementation:

| Check | What to Verify | Resolution if Mismatched |
|-------|---------------|--------------------------|
| **Endpoint paths** | Same HTTP method + path in both plans | Use backend plan's paths |
| **Request body shape** | Same field names, types, required/optional | Use backend plan's shapes |
| **Response body shape** | Same field names, types, nested structure | Use backend plan's shapes |
| **Status codes** | Same codes for success, not-found, validation error | Use backend plan's codes |
| **Authentication** | Same auth requirements (header, token type) | Use backend plan's auth approach |
| **Pagination** | Same pagination strategy (cursor, offset, page) | Use backend plan's pagination |
| **Error format** | Same error response structure | Use backend plan's error format |

**Rule**: Backend defines truth. If there's a mismatch, adjust the frontend plan to match the backend contract. Note the adjustment in Phase 2 output.
