---
name: reviewer
description: >-
  Review code for quality, architecture conformance, and test coverage grounded
  in knowledge base principles. Use when the user wants to review code, check an
  implementation, assess test quality, find issues in a PR, evaluate a refactoring,
  or get feedback on code they wrote. Make sure to use this skill whenever the
  user asks "review this code", "check this implementation", "what's wrong with
  this code", "review this PR", or provides file paths, git diffs, or branch
  names expecting quality feedback — even if they don't say "review" explicitly.
  Also use for: OOP design (coupling, typing, inheritance vs composition), code
  smells (shotgun surgery, divergent change, split phase, parallel inheritance),
  domain events (publishing strategy, event naming, idempotency, DI wiring, CDC),
  projections (costly joins, cross-context queries), hexagonal architecture
  (layer violations, interface-overuse, structural coupling, Testing Library
  anti-patterns, accessibility testing).
license: MIT
metadata:
  author: medine-tech
  version: "1.0.0"
---

# Reviewer

Review code for quality, architecture conformance, and test coverage grounded in knowledge base principles. The output is a structured review report in conversation — never modify the code under review.

## Project Conventions

Before applying this skill, read the project's root `AGENTS.md` and any
`docs/*.md` files it indexes that are relevant to this task. Project-specific
conventions override this skill's generic defaults; when they conflict,
the project wins and the skill records the override in the output.

## Phase 0: Validate Environment

Before starting the review, verify the project builds and passes its test suite. A failing CI invalidates the review — there is no point in reviewing code that does not compile or pass tests.

**Decision logic:**

1. **Check the prompt first.** If the user provides CI or test failure output directly in the prompt (e.g., `npm test` output showing failures, error stack traces from test runs), treat this as a confirmed CI failure — skip to step 3 "Fail" immediately. Do not re-run the tests.
2. Otherwise, look for a CI entry point: `Makefile`, `package.json` scripts, `Cargo.toml`, `pyproject.toml`, or equivalent. If found, run the project's test command (e.g., `make test`, `npm test`, `pytest`, `cargo test`).
3. Evaluate the result:
   - **Pass** → Continue to Phase 1.
   - **Fail** → **STOP the review.** Report a single Critical finding: "CI fails — tests must pass before code review." Include the failure output, identify the likely root cause, and exit. **Do not proceed to Phase 1 — no architecture, naming, or design findings.** The only acceptable output is the Critical CI finding.
   - **No CI found** (and no failure in prompt) → Log "No CI entry point detected — skipping environment validation." Continue to Phase 1.

**PR scope:** If reviewing a PR (URL or branch provided), also run:
```bash
gh pr view <PR_ID> --json statusCheckRollup -q '.statusCheckRollup[].conclusion'
```
If any check reports `FAILURE`, stop and report as Critical.

## Phase 1: Understand What to Review

Determine the scope and gather context before assessing anything.

**Determine scope:**
- Explicit files or directories provided by the user
- Git diff: `git diff HEAD~1`, `git diff main...feature-branch`, or a specific commit range
- PR branch: diff against the base branch
- Module or feature: all files under a directory

**Classify the code type:**
- **Backend**: Services, domain models, repositories, API endpoints, middleware
- **Frontend**: Components, hooks, pages, state management, data fetching
- **Tests**: Test files, test utilities, test data factories
- **Mixed**: Full-stack features spanning multiple layers

**Gather context** using `codebase-retrieval` and `Glob`:
- Tech stack: language, framework, ORM, test framework
- Architecture pattern: hexagonal, layered, MVC, App Router, Pages Router
- Directory conventions: where domain, application, and infrastructure code live
- Naming conventions: how existing files, classes, and methods are named
- Test patterns: testing framework, test organization, existing test doubles

**Find a reference implementation.** Search for a similar, well-established feature in the codebase. This is your quality baseline — the code under review should match its conventions, structure, and patterns.

**Load project-specific rules.** Read `AGENTS.md` in the project root if it exists. Then check for `AGENTS.md` files in each directory modified by the diff — these contain module-specific conventions that override general principles.

**Check previous feedback (PR scope only).** If reviewing a PR, run:
```bash
gh pr view <PR_ID> --comments
```
Scan for unresolved review comments from previous rounds. Flag any ignored feedback as a finding in Phase 6 — prior review comments that were not addressed or explicitly declined are treated as unresolved issues.

**Calibrate review depth.** Adjust the review thoroughness based on the diff size and type:

| Diff Size | Depth |
|-----------|-------|
| **Small (< 50 lines)** | Focus findings only on the changed code. Don't review the whole file. |
| **Medium (50-300 lines)** | Assess changed files in context of their module. Read neighboring files to understand conventions. |
| **Large (> 300 lines)** | Full rubric assessment. Check cross-file consistency and architecture alignment. |

**Type-specific adjustments:**
- **Test-only changes** → Skip code quality, focus entirely on Phase 4 (test quality).
- **Config/infrastructure changes** → Focus on Infrastructure checklist and security. Skip domain modeling.
- **Refactoring (no behavior change)** → Verify tests stay green. Focus on Refactoring checklist.
- **New feature** → Full rubric. Pay extra attention to missing test coverage and domain modeling.

## Phase 2: Consult the Knowledge Base

Every finding must trace back to a KB principle or Vercel rule. Generic opinions without KB sources are not acceptable.

1. Read `references/kb-topic-map.md` to identify which KB lessons and Vercel rules are relevant based on the code type. Use the Quick Selection Guide for fast matching.

2. Select 2-4 lessons based on the code type and issues you anticipate. Read them using the `Read` tool.

3. Read `references/review-checklist.md` — this is your assessment rubric. Walk through each applicable section.

4. Read `references/feedback-guide.md` — this governs how you frame and deliver findings.

**Lesson selection heuristics:**
- Domain models → `objects-vs-data-structures-and-encapsulation.md`
- Service/use case naming → `srp-refactoring-and-naming-conventions.md`
- Switch/conditional logic → `abstract-classes-service-extraction-and-coupling-tradeoffs.md`
- API design (full) → all 6 `ZALANDO_API` lessons + `atdd-practical-example-with-tdd.md`
- API endpoint (single) → `url-design-and-resource-naming.md` + `http-methods-and-status-codes.md` + `json-payload-conventions.md`
- URL / resource naming → `url-design-and-resource-naming.md`
- Error response format → `http-methods-and-status-codes.md`
- Pagination strategy → `headers-performance-and-pagination.md`
- API versioning / compatibility → `compatibility-versioning-and-deprecation.md`
- Test quality → `test-doubles-and-maintainable-tests.md` + `semantic-testing-and-given-when-then-methods.md`
- Time dependencies → `flaky-tests-and-time-dependent-testing.md`
- Components/rendering → Vercel `rerender-*` and `rendering-*` rules
- Data fetching → Vercel `async-*` and `server-*` rules
- State management → Vercel `rerender-derived-state*` rules
- Bundle/performance → Vercel `bundle-*` rules
- Refactoring workflow → `refactoring-strategies-and-technical-debt.md`
- SOLID violations → `introduction-to-solid-and-stupid-principles.md` + `dependency-inversion-principle.md`
- Composition vs inheritance → `composition-over-inheritance.md` + `gilded-rose-kata-refactoring.md`
- Repository design / Criteria → `criteria-pattern.md` + `srp-applied-to-crud.md`
- YAGNI / over-engineering → `four-rules-overview.md` + `yagni-and-premature-abstractions.md`
- Duplication assessment → `code-duplication-types-and-strategies.md`
- Fragile tests → `fragile-tests-and-bug-reproduction.md`
- Value object design / VO extraction → `value-objects-before-after-benefits.md` + `refactoring-and-modeling-domain-logic.md`
- Constructor visibility / instantiation patterns → `instantiation-debate-and-constructor-patterns.md`
- Error handling / optional values / defaults → `optional-values-errors-and-defaults.md`
- Object Mother depth / testing VOs → `testing-with-object-mothers.md`
- Aggregate design / growth → `aggregates-and-their-challenges.md` + `orchestration-and-bounded-contexts.md`
- Bounded context / module promotion → `orchestration-and-bounded-contexts.md` + `conventions-and-vo-entity-modeling.md`
- Repository design → `repository-pattern-introduction.md` + `infrastructure-leaks-and-structural-coupling.md`
- Repository testing → `repository-testing-strategies.md`
- CQRS / read-write separation → `orm-mapping-collaborators-and-cqrs.md`
- Domain events (full) → all 9 `DOMAIN_EVENTS` lessons
- Event publishing strategy → `DOMAIN_EVENTS/domain-event-publishing-strategies.md`
- Event granularity / naming → `DOMAIN_EVENTS/event-granularity-and-semantics.md` + `DOMAIN_EVENTS/event-naming-and-versioning.md`
- Event subscribers → `DOMAIN_EVENTS/derived-use-cases-and-event-subscribers.md`
- Internal vs external events → `DOMAIN_EVENTS/internal-external-events-and-enrichment.md`
- Event bus / DI → `DOMAIN_EVENTS/event-bus-implementation-and-di-integration.md`
- Legacy event refactoring → `DOMAIN_EVENTS/refactoring-legacy-systems-with-domain-events.md` + `DOMAIN_EVENTS/change-data-capture-for-legacy-events.md`
- Projections / read model → all 5 `PROJECTIONS` lessons
- Cross-context data → `PROJECTIONS/resolving-cross-context-data-in-projections.md`
- Identifier strategy → `uuids-integrity-and-validation.md` + `non-uuid-identifiers.md`
- Primitives pattern → `primitives-pattern.md`
- ORM mapping → `orm-mapping-collaborators-and-cqrs.md`
- Gateway pattern → `repository-full-entities-and-gateway-pattern.md`
- Hexagonal architecture (backend) → all 8 `HEXAGONAL` lessons
- Hexagonal frontend → all 7 `HEXAGONAL_FE` lessons
- Layer violations / dependency rule → `HEXAGONAL/hexagonal-layers-and-dependency-rule.md` + `HEXAGONAL_FE/map-feature-type-decoupling-and-layer-rules.md`
- Frontend testing quality → all 5 `FE_TESTING` lessons
- Accessibility testing → `FE_TESTING/accessibility-benefits-and-query-selection.md`
- Strategic DDD / bounded contexts → `DDD/ddd-overview-and-concepts.md` + `DDD/defining-bounded-contexts-and-modular-architecture.md`
- Cross-context coupling → `DDD/sharing-code-between-bounded-contexts.md` + `DDD/event-driven-cross-module-data-materialization.md`
- Module promotion → `DDD/promoting-modules-to-bounded-contexts.md`
- CQRS assessment → `DDD/hexagonal-architecture-vs-cqrs.md`
- Legacy migration review → `DDD/legacy-migration-with-domain-events.md`
- Outside-in / ubiquitous language → `DDD/outside-in-development-and-ubiquitous-language.md`

## Phase 3: Assess Code Quality

Walk through the code systematically. For each concern, observe what the code does before applying a principle.

### Universal Concerns
- **Naming**: Agent noun use cases, boolean prefix (is/has/can), context-aware names, no "Impl" suffix
- **SRP**: Each class/component has one reason to change
- **Encapsulation**: Tell-Don't-Ask — behavior lives on the object that owns the data
- **Value Objects**: Primitives with meaning extracted (Money, Email, Capacity)
- **Guard clauses**: Early returns instead of nested if-else
- **Abstraction levels**: Functions operate at a single level of abstraction
- **Comments**: Only "why", never "what"
- **Coupling**: Minimum data passed between layers; scalar IDs and VOs over whole aggregates
- **Constructor Visibility**: Private constructor + lifecycle factory methods (`create`, `reconstitute`) + `fromPrimitives` for ORM. Public constructors on VOs are a flag.
- **Default Parameters**: Flag as anti-pattern in domain constructors — recommend factory methods to restrict API surface instead.
- **Optional VO Modeling**: VOs are never nullable — aggregate-level Maybe/Optional for optional fields. No Null Object pattern (hides missing data behind silent behavior).
- **VO Collections**: Cross-item validation belongs in a collection VO (e.g., `Students` enforces capacity), not in the service layer.

### Backend-Specific
- **Search vs Find**: Search returns empty collection (no exception), Find throws domain exception when not found. Watch for naming mismatches — a method named `search` that throws on not-found is using `find` semantics with `search` naming
- **Service layer**: Use cases orchestrate, business rules live in domain
- **Infrastructure**: Ports defined for external dependencies, adapters implement them
- **DTOs**: Separate from domain objects, exist only for boundary crossing
- **Domain Exceptions**: Typed context properties — flag generic `Error`/`Exception` thrown from domain or application layer. Exception should carry what failed, which entity, which value.
- **Either vs Exceptions**: Note when Either may be appropriate (functional pipelines, explicit error flows) — defer to team convention. For most backend services, custom exceptions are preferred.
- **God Aggregate**: Flag aggregates with too many entities/VOs. Check for horizontal/vertical growth that should be split. An aggregate with 10+ child entities is a red flag.
- **Missing Aggregate Root**: Flag direct access to child entities bypassing the root. External code should never reach into aggregate internals.
- **N+1 via Aggregate Growth**: Flag lazy loading across aggregate boundaries. Aggregates should load their full state eagerly, not lazy-load related aggregates.
- **Domain Events**: Flag aggregates that directly call external services instead of publishing events. Side effects belong in event handlers, not aggregate methods.
- **Event Publishing Strategy**: Flag EventBus injected into aggregate constructors (infrastructure coupling, violates hexagonal dependency rule). Flag `publish()` calls missing after `pullDomainEvents()`. The recommended pattern is aggregate root record+pull — aggregate records events, use case publishes after save. [KB: domain-event-publishing-strategies]
- **Event Granularity**: Flag CRUD-like event names (`UserUpdated`, `OrderChanged`) — prefer semantic, fine-grained events (`UserArchived`, `OrderItemAdded`). Flag `updateStatus()` methods — should be explicit state transitions (`archive()`, `reactivate()`). Flag coarse events carrying full entity payloads except for data lake consumers. [KB: event-granularity-and-semantics]
- **Event Naming**: Flag flat event names (`user_registered`) — should use structured format (`vendor.message_type.context.aggregate.action.version`). Flag events without version suffix. [KB: event-naming-and-versioning]
- **Event Subscribers**: Flag subscribers that contain business logic directly instead of delegating to use cases. Flag subscriber naming that doesn't follow ActionOnEvent pattern. Flag missing subscriber tests — subscribers are the entry point and must be tested with Object Mother and mocked dependencies. Flag database persistence as a derived subscriber action (persistence belongs in the primary use case). [KB: derived-use-cases-and-event-subscribers]
- **Internal vs External Events**: Flag all events published externally by default — events should be internal unless another bounded context explicitly needs them. Flag external event DTOs in the domain layer (should be in shared kernel). Flag missing enrichment on external events (consumers shouldn't need to reconstruct lifecycle from multiple events). [KB: internal-external-events-and-enrichment]
- **Idempotent Consumers**: Flag event consumers without idempotency handling. At-least-once delivery means duplicate events are normal. Consumers must use stored event IDs or early-return patterns. [KB: introduction-to-domain-events]
- **Primitives Pattern**: Flag getter explosion on aggregates — recommend toPrimitives/fromPrimitives for serialization and test assertions.
- **Missing Bounded Context**: Flag same entity serving different use cases with different shapes. Different contexts deserve different models.
- **Infrastructure Leaks**: Flag flush() exposed to domain, MongoDB _id in domain naming, inconsistent method names (add/get mixed with save/search).
- **Header vs Role Interface**: Flag repositories extracted bottom-up from implementation (header interface) vs designed from client needs (role interface). Role interfaces are minimal.
- **Method Explosion**: Flag repositories with >3 finder methods — recommend Criteria pattern with `matching(criteria)`.
- **Partial Entities**: Flag repositories returning partial objects (lose invariants, skip domain events). Full aggregates are the default.
- **Missing Gateway Pattern**: Flag non-persistence collaborators (email, payment) using Repository naming or pattern. These should use Gateway.
- **CQRS Misuse**: Flag read/write repository splitting by SQL verb instead of bounded context separation. CQRS is about different models for different contexts, not separating SELECT from INSERT.
- **Cross-Context Direct Coupling**: Flag modules importing domain classes from another bounded context directly (not through shared kernel or events). Contexts should communicate via event bus or query bus, never via direct service/repository injection across context boundaries. [KB: defining-bounded-contexts-and-modular-architecture]
- **Unsafe Shared Kernel**: Flag behavior-heavy VOs or validator classes shared between bounded contexts. Safe to share: ID types, event contracts, enums. Risky: VOs with business logic, shared validators (break in polyglot systems, diverge when contexts evolve independently). [KB: sharing-code-between-bounded-contexts]
- **Missing Module Promotion**: Flag a single module serving 3+ distinct use cases with different entity shapes — this is a bounded context trying to escape. Check for optional fields and type discriminators that split behavior. Propose promotion when organizational signals are present (dedicated team, independent release cadence). [KB: promoting-modules-to-bounded-contexts]
- **Direct Cross-Context DB Queries**: Flag repositories or services querying another context's database tables directly for read models. Should use event-driven local projections instead — subscribe to events, build local read model. Direct queries create hidden coupling and break team autonomy. [KB: event-driven-cross-module-data-materialization]
- **CQRS by SQL Verb**: Flag "ReadUserRepository" / "WriteUserRepository" splits based on SELECT vs INSERT. CQRS is about different models for different bounded context concerns, not separating SQL verbs. A read repository and write repository in the same context is just two repositories, not CQRS. [KB: hexagonal-architecture-vs-cqrs]
- **Missing Ubiquitous Language**: Flag infrastructure terminology leaking into domain layer naming — method signatures like `search(key: string)` that reveal Redis/Elasticsearch origin, `flush()` exposed to application layer, `_id` from MongoDB in domain naming. Domain interfaces should be designed from business needs, not extracted from infrastructure API shapes. [KB: outside-in-development-and-ubiquitous-language]
- **Monolith Extraction Without Containment**: Flag legacy migration code that refactors internals without first wrapping behind a repository interface as containment barrier. The safe order is: contain (wrap behind interface) → decouple (extract side effects via events) → extract (promote to context). Refactoring internals before containment risks breaking unknown callers. [KB: legacy-migration-with-domain-events]
- **Costly Joins as Projections Signal**: Flag N-way joins in repositories that serve read-heavy use cases — these are candidates for projections (database views, materialized views, or application-level projections). Use the eight-criteria comparison to recommend the appropriate strategy. [KB: decision-criteria-for-data-modeling]
- **Missing Projection Idempotency**: Flag projection subscribers that don't handle duplicate events. Projection creation should use early return if entity exists. Counter-based projections need stored event IDs for deduplication. [KB: implementing-user-retention-projections]
- **Cross-Context Direct Queries**: Flag services that query another bounded context's database or API to populate read models. Prefer local projections via event subscriptions — they preserve team autonomy and work across distributed databases. [KB: resolving-cross-context-data-in-projections]
- **Event Enrichment Coupling**: Flag domain events enriched with data from other aggregates or contexts to satisfy consumer needs. This violates OCP (publisher changes when consumer needs change). Prefer intermediate consumer enrichment or local projections. [KB: internal-external-events-and-enrichment]
- **Hexagonal Layer Violation**: Flag domain imports from infrastructure. Flag application layer importing infrastructure directly (should go through ports). Use the import check heuristic. [KB: hexagonal-layers-and-dependency-rule]
- **Interface-Overuse in Domain Services**: Flag domain services with interfaces and DI injection. Domain services are instantiated directly — interfaces add unnecessary indirection. Only infrastructure dependencies need interfaces. [KB: domain-vs-application-services]
- **Infrastructure Interface Coupling**: Flag interfaces shaped by external API surface (structural coupling) instead of domain needs. Flag constructors included in interface contracts. [KB: infrastructure-services-and-notification-patterns]

### API Design (Backend)
- **URL conventions**: Flag verb-based paths (`/getUsers`), camelCase or snake_case in paths, singular resource names, `/api` prefix, deep nesting (>3 levels)
- **JSON conventions**: Flag camelCase properties, non-UPPER_SNAKE_CASE enums, nullable booleans, null arrays, bare array responses, raw numeric money amounts
- **HTTP semantics**: Flag generic 400 for validation (should be 422), missing Problem JSON format, exposed stack traces or internal details in error responses
- **Pagination**: Flag unbounded list responses, offset-based pagination without justification, missing `next`/`prev` links, `total_count` without performance justification
- **Compatibility**: Flag removed/renamed fields, URL versioning (`/v1/`), closed enums without extensibility strategy, changed status codes on existing endpoints

### Frontend-Specific
- **Server/client boundary**: Server Components by default, `'use client'` pushed to leaves
- **Derived state**: Calculated during render, never synced with useEffect + setState
- **Parallel fetching**: Sibling components or Promise.all() for independent data
- **Conditional rendering**: Ternary, not && (falsy value leaks)
- **Serialization**: Minimum data passed from Server to Client Components
- **Bundle**: Direct imports (no barrel files), dynamic imports for heavy components
- **Layer-first Organization**: Flag top-level `components/`, `hooks/`, `services/` directories when the project would benefit from feature-first organization. [KB: hexagonal-vertical-slicing-and-frontend-adaptation]
- **Missing Repository Abstraction**: Flag direct fetch/localStorage calls in components or use cases — should go through repository interfaces. [KB: hexagonal-frontend-course-app-repository-validation]
- **Testing Library Anti-Patterns**: Flag getByTestId when getByRole or getByLabelText would work. Flag fireEvent when User Event should be used. Flag shallow mount usage. [KB: introduction-to-testing-library, accessibility-benefits-and-query-selection]
- **Missing Accessibility Testing**: Flag test suites without AXE validation (jest-axe). [KB: accessibility-benefits-and-query-selection]

## Phase 4: Assess Test Quality

If tests are in scope (either as the review target or accompanying the reviewed code), assess them against KB testing principles.

- **Layer selection**: Classification-aware — features covered at unit/component only (backend: use case with infra mocked; frontend: component with MSW-mocked API); bugs covered at the §4.3-classified layer (lowest layer that reproduces the root cause; visual/UX and misuse rows via justify-or-test, see ADR 0007); refactors covered by characterization tests at the same layer as the refactored code. Do not flag features lacking acceptance/E2E tests.
- **GWT structure**: Every test follows Given-When-Then with descriptive names
- **Test doubles taxonomy**: Correct double type — stubs for reads, spies for writes, dummies for unused deps; not MagicMock for everything
- **Object Mother**: Semantic factory methods for test data, not inline magic values
- **Isolation**: No shared mutable state between tests, no implicit setUp() coupling
- **Time dependencies**: Clock injection, not patching datetime globally
- **Missing coverage**: Identify untested paths — error cases, edge conditions, state transitions

## Phase 4b: Strict Mode Verification (MANDATORY)

After assessing code and test quality, verify all strict mode gates. These are non-negotiable — every review must include this verification regardless of task size.

### Gate 1: Tech Debt Reduction
- Verify a tech debt inventory exists (from architect plan or developer pre-flight)
- Verify all FIX_IN_THIS_TASK items were actually resolved
- Verify the modified area is measurably cleaner than before the changes
- **Failure**: Critical if tech debt increased, Major if unchanged

### Gate 2: Clean Code
- Verify guard clauses are used instead of nested if-else
- Verify functions/components operate at a single level of abstraction
- Verify meaningful, context-aware naming throughout new code
- Verify no "what" comments — only "why" comments where non-obvious
- **Failure**: Major

### Gate 3: Test-First Discipline at Chosen Layer
- Identify the classification (feature/bug/refactor) pinned to the user's framing
- Verify a failing test at the chosen layer existed before production code:
  - **Feature** → unit/component test (backend: use case with infra mocked; frontend: component with MSW-mocked API)
  - **Bug** → failing test at the layer chosen from the §4.3 classification table in [ADR 0007](../../docs/adr/0007-feature-stripe-and-red-test-bug-classification.md) — the lowest layer that reliably reproduces the diagnosed root cause
  - **Refactor** → characterization tests at the same layer that covers the refactored code
- Verify red-green-refactor cycle was followed at the chosen layer (check git history or test file timestamps)
- Correct feature implementations with only unit/component tests must NOT be flagged
- A bug whose §4.3 class routes out of automated testing (visual/UX, or misuse with no assertable rule) is verified by a one-line justify-or-test justification, not a red test — the absence of an automated test there is NOT a failure
- High-risk areas (auth, payments, PII, public API) get advisory only — never override the user's classification
- **Failure**: Critical if no failing test at the chosen layer preceded production code and no justify-or-test justification was recorded. Missing acceptance/E2E tests for a feature are NOT a failure.

### Gate 4: Test Pyramid (Single-Layer Stripe)
- Verify unit/component tests exist for every feature change (backend: use case with infra mocked; frontend: component with MSW-mocked API)
- Verify deeper layers (integration, acceptance, E2E) are ONLY used when a bug reproduces there or a refactor's characterization lives there
- Verify visual/UX and misuse-without-a-rule bugs (§4.3 rows 4-5, see ADR 0007) carry a justify-or-test justification instead of an automated test
- Default is a single-layer stripe — do not flag features lacking acceptance/E2E tests
- Flag first adapter bug in an unharnessed project as a FIX_IN_THIS_TASK harness setup item
- **Failure**: Critical if test at the chosen layer missing, Major if wrong layer selected

### Gate 5: DDD/Hexagonal (Backend) or Architecture Compliance (Frontend)
- Verify new code follows DDD/hexagonal patterns (backend) or recommended frontend patterns
- Verify non-compliant areas have a documented migration strategy
- **Failure**: Major

### Gate 6: Migration Strategies
- Verify every identified anti-pattern has either a fix or a documented strategy
- Verify no anti-patterns are left as "leave as-is" without justification
- **Failure**: Major

### Gate 7: Strict Mode Compliance Summary

Produce a compliance table in the review report:

| Gate | Status | Evidence |
|------|--------|----------|
| 1. Tech Debt Reduction | PASS/FAIL | [Brief evidence] |
| 2. Clean Code | PASS/FAIL | [Brief evidence] |
| 3. Test-First Discipline at Chosen Layer | PASS/FAIL | [Brief evidence] |
| 4. Test Pyramid | PASS/FAIL | [Brief evidence] |
| 5. Architecture Compliance | PASS/FAIL | [Brief evidence] |
| 6. Migration Strategies | PASS/FAIL | [Brief evidence] |

Any FAIL triggers the fix-review loop. The loop continues until all gates pass.

## Phase 6: Gather Second Opinions (Optional)

Request external review suggestions from Gemini CLI and Codex CLI. Both act as consultants — you make all final decisions.

**1. Check availability:**

```bash
which gemini && gemini --version
which codex && codex --version
```

If both return non-zero, skip to Phase 6. If at least one is available, continue.

**2. Prepare the diff** from the scope determined in Phase 1 (e.g., `git diff HEAD~1`, `git diff main...feature-branch`).

**3. Invoke each available CLI** following the commands and prompt template in `references/second-opinion-guide.md`. Use the code type and tech stack from Phase 1 to fill the prompt template.

**4. Parse and evaluate** each external finding using the evaluation protocol in `references/second-opinion-guide.md`:

- Is the observation factually correct?
- Is it a duplicate of an existing finding?
- Does it align with project conventions and KB principles?
- Is it actionable and beneficial?

Accept or decline each suggestion with a one-sentence reason.

**5. Error handling:** Timeouts, non-zero exits, empty output, or unparseable responses never block the review. Log the issue and continue. See the error handling table in `references/second-opinion-guide.md`.

## Phase 7: Deliver Findings

Structure the review report using the feedback principles from `references/feedback-guide.md`.

### Report Structure

```
## Review Summary

Brief overview: what was reviewed, code type, overall assessment.

## Positive Observations

Genuine observations of what the code does well — patterns followed, good naming, effective testing. These are not filler. If the code handles state transitions well, say so.

## Findings

### [Severity] Finding Title

**Location:** `file:line` or `file:method`
**Observation:** What the code currently does (factual, no labels).
**Principle:** The KB principle that applies. [KB: lesson-filename] or [Vercel: rule-filename]
**Recommendation:** What to change and why.

(Repeat for each finding. Accepted second-opinion findings go here tagged with `[Second Opinion: gemini]` or `[Second Opinion: codex]`)

## Summary Table

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 1 | Critical | ...     | file:line |
| 2 | Major    | ...     | file:line |

## Declined Second-Opinion Suggestions

| Source | Suggestion | Reason |
|--------|-----------|--------|
| gemini | ...       | Duplicate of Finding #1 |
| codex  | ...       | Not actionable — ... |

(Omit this section and the [Second Opinion:] tags entirely if no CLIs were available)
```

### Severity Levels

| Severity | Criteria | Examples |
|----------|----------|---------|
| **Critical** | Breaks correctness, loses data, security issue, missing invariant enforcement | Missing capacity check allows over-enrollment, unvalidated user input |
| **Major** | Violates core architecture principle, will cause maintenance pain | Tell-Don't-Ask violation, entire page as 'use client', missing test coverage for critical path |
| **Minor** | Naming convention, style issue, suboptimal pattern | Verb-first naming, missing boolean prefix, comments explaining "what" |
| **Suggestion** | Nice-to-have improvement, alternative approach worth considering | Could use Object Mother, could parallelize independent fetches |

### Delivery Rules

1. **Observation before judgment.** Describe what the code does before saying what it should do.
2. **Specific over general.** "The `enroll` method accesses `course.students.length` directly" not "the code has encapsulation issues."
3. **No feedback sandwich.** Don't wrap findings between positive observations. Positive observations are their own section.
4. **Growth mindset language.** "This pattern can be improved" not "this is bad code."
5. **Relative, not absolute.** "This has more responsibilities than typical use cases in this codebase" not "this violates SRP."
6. **At least one positive observation per review.** Every codebase has something worth acknowledging.
7. **Cite the source.** Every finding includes `[KB: lesson-filename]` or `[Vercel: rule-filename]`.

### Verdict

After all findings are compiled, assign an explicit verdict based on severity:

| Verdict | Criteria |
|---------|----------|
| **APPROVE** | No Critical or Major findings. Minor and Suggestion findings only. |
| **COMMENT** | No Critical findings. One or more Major findings that are debatable or context-dependent. |
| **REQUEST_CHANGES** | One or more Critical findings, OR multiple Major findings with clear fixes. |

**Placement:** The verdict appears at the top of the Review Summary section, immediately after the brief overview line. Format: `**Verdict: APPROVE**` (or COMMENT / REQUEST_CHANGES).

### Publication Gate (PR scope only)

If reviewing a PR, do **not** post comments or verdicts to GitHub automatically. After presenting the report to the user in conversation:

1. Show the proposed verdict and list of PR comments you plan to post.
2. Ask: *"Do you approve publishing this review to the PR?"*
3. Only proceed with `gh pr review` or `gh pr comment` after explicit user approval.

## Reference Documentation

- [KB Topic Map](references/kb-topic-map.md) — Maps code concerns to specific KB lessons and Vercel rules
- [Review Checklist](references/review-checklist.md) — Assessment rubric for code and test quality
- [Feedback Guide](references/feedback-guide.md) — Feedback delivery principles grounded in the KB
- [Second Opinion Guide](references/second-opinion-guide.md) — CLI invocation, prompt template, evaluation protocol for external reviewers
