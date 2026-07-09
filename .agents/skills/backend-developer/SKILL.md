---
name: backend-developer
description: Implement backend features by writing production code and tests grounded in knowledge base principles — outputs files on disk, not conversation text. Use this skill whenever the user asks for backend implementation, writing a use case, building a domain model, adding a repository adapter, fixing a backend bug, refactoring backend code, or running TDD red-green-refactor at the backend unit layer. Make sure to use this skill whenever the user wants backend code written, tested, or fixed — even if they don't say "developer" — and especially when an architecture plan is already in hand and ready to implement.
---

# Backend Developer

Implement backend features by writing production code and tests grounded in knowledge base principles. Output is files on disk — code, tests, and configuration.

## Phase 1: Understand the Task

**Classify the task:** new feature, refactoring, bug fix, or test coverage.

### Classification Routing (MANDATORY)

Classification is pinned to how the user framed the task. The developer never reclassifies unilaterally.

- **Feature / improvement**: "add", "new", "improve", "support" → feature flow (unit tests only).
- **Bug / regression**: "fix", "regression", "broken", "bug", "error" → bug flow (§4.3 red-test classification).
- **Refactor**: "refactor", "extract", "rename", "clean up" → refactor flow (same-layer characterization tests).
- **Explicit test coverage**: "add tests to X" → test at the layer X lives in.
- **Ambiguous framing** → ask ONE clarifying question, then proceed. Never guess.
- **Feature uncovers a latent bug** → stop the feature slice, run bug flow on the discovered bug first, then resume the feature. Two commits, not blended.

**Discover codebase context:**
- Tech stack: language, framework, ORM, package manager
- Architecture pattern: hexagonal, layered, MVC, modular monolith
- Directory structure: application, domain, infrastructure locations
- Naming conventions, test setup, how tests are run

**Find a reference implementation.** Search for an existing similar feature. Mirror its file structure, naming, test organization, and coding style. Never invent conventions the codebase doesn't use.

**Ask clarifying questions only when critical.**

## Phase 2: Consult the Knowledge Base

Every implementation decision should trace back to a KB principle. Apply them silently — only comment for non-obvious "why" decisions.

1. Identify which KB lessons are relevant to this task. Use the document summaries already indexed in the host project's AGENTS.md (the team-convention pointer in every project's root AGENTS.md describes where the KB index lives).

2. Select 1-3 lessons based on the task. Read the actual files.

3. Read `references/implementation-checklist-backend.md` — verify against it in Phase 5. (Testing principles cited in headlines below resolve to KB lessons under `../knowledge-base/courses/codely/.../testing-introduction-and-best-practices/`; there is no skill-local testing guide.)

## Phase 3: Implement in Vertical Slices

Each slice is a complete path — test to domain to infrastructure — independently committable and green.

### Strict Mode Pre-Flight (MANDATORY)

Before writing any code, verify the plan includes:

1. **Tech Debt Inventory**: Classified as FIX_IN_THIS_TASK or PROPOSE_FOLLOW_UP. If missing, scan yourself.
2. **DDD/Hexagonal Assessment**: If missing, assess the area yourself.

### Test Layer Selection (classification-aware)

Pick the test layer from the task classification before writing any test:

- **Feature flow** → unit tests only, at the use case layer. Infrastructure adapters are still *written* as part of the feature slice, but not *tested* until the first adapter bug triggers harness setup as `FIX_IN_THIS_TASK` tech debt.
- **Bug flow** → §4.3 red-test classification (see Phase 4 and ADR 0007): the red test lives at the lowest layer that reliably reproduces the diagnosed root cause.
- **Refactor flow** → characterization tests at the same layer as the refactored code. Domain/use case → unit. Adapter → integration. Multi-collaborator → acceptance.
- **Explicit test coverage** → user-authorized layer (wherever X lives).

### If refactoring: STOP — different workflow

1. **Characterization tests FIRST.** Capture current behavior before changing production code.
2. **Refactor the structure.** Keep all characterization tests green.
3. **Add per-type tests.** After refactored structure is green.

This order is non-negotiable.

### For new features: test-first vertical slices

**Red-Green-Refactor** for every slice:
1. **Red**: Failing test describing expected behavior
2. **Green**: Minimum production code to pass
3. **Refactor**: Clean up, tests stay green

**Slice ordering** — inside-out:
1. **Domain objects**: VOs, Entities with invariants, domain exceptions
2. **Use cases**: Application services with unit tests mocking infrastructure
3. **Infrastructure**: Adapters, controllers, framework wiring

**Coding principles (applied silently).** The architect's plan is the contract — its `[KB: ...]` citations are the source of truth for each pattern. Apply them silently; do not paraphrase the lesson into the code. The headlines below are reminders the architect's plan may not call out; when a trigger fires, read the cited lesson before writing the code.

#### Domain shape

- **Value Objects** [when introducing a primitive that carries meaning]: VO attracts validation and behavior; Tell-Don't-Ask. [KB: objects-vs-data-structures-and-encapsulation]
- **VO Constructor Patterns** [when defining a VO's lifecycle]: private constructor + factory methods + `fromPrimitives` for ORM. [KB: instantiation-debate-and-constructor-patterns]
- **Contextual VO Naming** [when naming a VO]: `UserEmail` not `Email`; scoped to its module. [KB: conventions-and-vo-entity-modeling]
- **Optional Values** [when a value may be absent]: VOs never nullable; Maybe/Optional at aggregate level; no Null Object. [KB: optional-values-errors-and-defaults]
- **Error Handling** [when modeling failure]: typed exception properties; factory methods over default parameters. [KB: optional-values-errors-and-defaults]
- **Parallel Change** [during migration of a method]: keep old method alongside new. [KB: refactoring-and-modeling-domain-logic]

#### Aggregates and events

- **Aggregate Root** [for every mutation]: single entry point; Law of Demeter. [KB: aggregates-and-their-challenges]
- **Aggregate Splitting** [when growth becomes unmanageable]: identifier references, never lazy-load across boundaries. [KB: aggregates-and-their-challenges]
- **Domain Events** [when state changes that other contexts care about]: record via factory method; test via custom matcher. [KB: domain-events-and-aggregate-testing]
- **Event Publishing** [for every aggregate that records events]: aggregate root record+pull; `pull` clears internal list. [KB: domain-event-publishing-strategies]
- **Event Subscribers** [when wiring side effects to events]: ActionOnEvent naming; separate from use case; UID in subscriber. [KB: derived-use-cases-and-event-subscribers]
- **Event Granularity** [when naming an event]: fine-grained semantic events; explicit aggregate methods. [KB: event-granularity-and-semantics]
- **Event Bus** [when wiring an in-memory bus]: subscriber map; adding subscriber = zero existing-wiring changes (OCP). [KB: event-bus-implementation-and-di-integration]
- **Idempotent Consumers** [for any at-least-once delivery]: stored event IDs or early-return patterns. [KB: introduction-to-domain-events]
- **Primitives Pattern** [for persistence and testing]: `toPrimitives()` / `fromPrimitives()`. [KB: primitives-pattern]

#### Cross-context

- **Bounded Context Folder Structure** [when adding a new context]: `src/<context>/(application, domain, infrastructure)`. [KB: defining-bounded-contexts-and-modular-architecture]
- **Cross-Module Event Subscribers** [when one context reacts to another's events]: subscriber-as-controller; ActionOnEvent naming. [KB: event-driven-cross-module-data-materialization]
- **Query Bus for Cross-Context Reads** [when one context needs another's read shape]: never inject another context's repo directly; returns DTOs. [KB: hexagonal-architecture-vs-cqrs]
- **Shared Kernel** [when adding to `shared/`]: only ID VOs, event contracts, enums; never share instances. [KB: sharing-code-between-bounded-contexts]
- **Projections** [for cross-context read models]: event-subscriber projections; scalar fields for projected entities. [KB: implementing-user-retention-projections]
- **Idempotent Projections** [for any projection rebuilt from events]: early return for duplicates; stored event IDs for counters. [KB: modeling-likes-and-projections]
- **Cross-Context Data** [when fetching neighbor-context data]: local projections over direct API calls. [KB: resolving-cross-context-data-in-projections]

#### Repository and infrastructure

- **Repository Contract** [for every aggregate root]: interface in domain, adapter in infrastructure; Search/Find enforcement. [KB: repository-pattern-introduction]
- **Search vs Find** [when designing a finder]: search returns empty; find throws; map exceptions to HTTP at the boundary. [KB: repository-pattern-introduction]
- **Infrastructure Leak Prevention** [reviewing the adapter surface]: no `flush()` in domain; adapter encapsulates UoW. [KB: infrastructure-leaks-and-structural-coupling]
- **Criteria Pattern** [when finder methods exceed three]: `matching(criteria)`. [KB: caching-criteria-and-transactions]
- **Full Entities** [for command-side repositories]: return/receive full aggregates. [KB: repository-full-entities-and-gateway-pattern]
- **Gateway Pattern** [for non-persistence collaborators]: use Gateway, not Repository. [KB: repository-full-entities-and-gateway-pattern]
- **Hexagonal Layer Discipline** [on every import]: domain imports infrastructure → extract a port. [KB: hexagonal-layers-and-dependency-rule]
- **Infrastructure Services** [for any external dependency]: port/adapter pattern; design from domain needs; fake for testing. [KB: infrastructure-services-and-notification-patterns]
- **Domain vs Application Services** [when extracting service logic]: domain = reusable cross-aggregate; application = transactional boundary; never mock domain services. [KB: domain-vs-application-services]
- **Adapter inputs** [when calling an adapter]: pass minimum data, not whole aggregates.

#### API surface

- **Use case naming** [for every application service]: agent nouns (`StudentEnroller`); never verb-first or god-classes. [KB: srp-refactoring-and-naming-conventions]
- **URL conventions** [for every endpoint]: verb-free, kebab-case, pluralized; snake_case query params; no `/api` prefix. [KB: url-design-and-resource-naming]
- **JSON conventions** [for every payload]: snake_case properties, UPPER_SNAKE_CASE enums, never-null booleans. [KB: json-payload-conventions]
- **HTTP status codes** [for every response]: 422 for validation; Problem JSON (RFC 7807); never expose internals. [KB: http-methods-and-status-codes]
- **Pagination** [for every list endpoint]: cursor-based; nav links; avoid total counts. [KB: headers-performance-and-pagination]
- **Backward compatibility** [for every change to a public endpoint]: never remove/rename fields; additive only. [KB: compatibility-versioning-and-deprecation]

#### SOLID

- **Dependency direction** [enforce on every layer]: domain/application never import infrastructure. [KB: dependency-inversion-principle]
- **Interface design** [when extracting a port]: role interfaces from the client's perspective; minimal repository interfaces. [KB: interface-segregation-principle]
- **Composition over inheritance** [default for collaborators]: inject; classes `final` by default. [KB: composition-over-inheritance]
- **Simplicity** [before introducing a new abstraction]: Rule of Three; no premature factories. [KB: yagni-and-premature-abstractions]

## Phase 4: Write Tests

Mirror the reference implementation's test patterns exactly. Pick the test layer based on the classification routing from Phase 1.

### Default: Unit Tests Only (Features)

Features and improvements are covered at the **unit layer only**. Zero integration tests, zero acceptance tests, zero E2E — no exceptions for new adapters.

- One test class per use case
- "Unit" = use case + domain objects it orchestrates
- Mock only infrastructure ports (repositories, event publishers, external APIs)
- **Never mock domain services** [KB: test-doubles-and-maintainable-tests]
- Object Mother pattern: `StudentMother.enrolled()`, `CourseMother.full()`
  - One Mother per VO: `UserIdMother`, `UserEmailMother`
  - Partial params: override relevant fields, rest random via Faker
  - Faker anti-corruption layer: `UuidMother.random()` wraps Faker
  - Flaky tests from random data = edge case discovery
- Given-When-Then structure with descriptive names [KB: test-structure-srp-and-given-when-then]
- Doubles: Stub (returns data), Spy (records calls), Dummy (unused) [KB: test-doubles-and-maintainable-tests]
- Red-Green-Refactor at the unit layer [KB: tdd-red-green-refactor-and-tcr]
- Inner TDD loop only; outer ATDD wrapper is dropped as default — the feature single-layer stripe and the §4.3 bug-classification table are canonically defined in [ADR 0007](../../docs/adr/0007-feature-stripe-and-red-test-bug-classification.md) [KB: atdd-practical-example-with-tdd, unit-testing-and-test-pyramid]

**Infrastructure adapters are still written in feature slices, just not tested.** The first adapter bug in an unharnessed project triggers harness setup as `FIX_IN_THIS_TASK` tech debt, and from that point forward adapter bugs follow the bug flow.

### Bug Flow: §4.3 Red-Test Classification

Classify the bug from its **diagnosed root cause** (not the ticket wording), then pick the layer from the §4.3 table in [ADR 0007](../../docs/adr/0007-feature-stripe-and-red-test-bug-classification.md). The lowest layer that reliably reproduces the bug always wins.

- **Business-logic error** → **unit** test on the use case that owns the logic (observable with mocked infra: wrong invariant, missing guard)
- **Inter-module / contract error** → **integration** test on the boundary (real infrastructure required: incorrect SQL, ORM mapping, adapter translation)
- **Critical user-flow error** → **acceptance / E2E**, only when multi-collaborator wiring is required, with written justification
- **Misuse** (user does something allowed but should not be) → an input-validation or permission rule — that rule **is** a unit test; route to docs/UX only when there is genuinely no rule to assert
- **Visual / UX** (data correct, looks wrong) → out of scope for the backend; hand to QA validation

Routing a bug to a non-test outcome is **justify-or-test**: record a one-line justification, and when the class is ambiguous, write the test. Write the reproducing red test first, watch it fail, then fix to green. [KB: tdd-red-green-refactor-and-tcr]

### Refactor Flow: Same-Layer Characterization Tests

Characterization tests live at the same layer as the refactored code:

- **Domain / use case** refactor → unit characterization tests
- **Adapter** refactor → integration characterization tests
- **Multi-collaborator** refactor → acceptance characterization tests

No user approval required. Write characterization tests first, then refactor with tests green throughout. [KB: test-structure-srp-and-given-when-then]

### Explicit Test-Coverage Requests

When the user asks "add tests to X", write tests at whatever layer X lives in — unit for use cases/domain, integration for adapters, acceptance for endpoints. No bug needed.

### Test Folder Structure
```
test/
├── [module]/
│   ├── application/     <- Unit tests
│   ├── domain/          <- Unit tests (VOs, entities)
│   └── infrastructure/  <- Integration tests (bug/refactor flows only)
```

## Phase 5: Verify and Clean Up

1. **Run the full test suite.** All tests must pass.
2. **Run the linter.** Fix violations.
3. **Check against implementation checklist.** Read `references/implementation-checklist-backend.md` and verify.
4. **Tech debt report.** Resolved FIX_IN_THIS_TASK items. New PROPOSE_FOLLOW_UP items.
5. **Clean code verification.** Guard clauses, single abstraction level, meaningful names, no "what" comments.
6. **Report what was built.** Files created/modified, test coverage, deviations with rationale.

## Guidelines

**Mirror the codebase.** Reference implementation is your style guide. New code looks like it was written by the same developer.

**Language-specific idioms.** Code must be idiomatic for the project's language and framework.

**No over-engineering.** Only write what the task requires. No extra features, handling for impossible cases, or speculative abstractions.

**Refactoring is separate from feature work.** Never in the same slice.

## Reference Documentation

- [Implementation Checklist](references/implementation-checklist-backend.md) — workflow scaffold; not a knowledge surface.
