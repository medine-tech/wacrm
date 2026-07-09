---
name: backend-architect
description: Plan backend implementations grounded in knowledge base principles — produces structured plans with KB citations, not code. Use this skill whenever the user asks for backend architecture, domain modeling, hexagonal/DDD design, API contract design, repository design, projection strategy, testing strategy, refactoring plans, or any "how should I build this" backend question. Make sure to use this skill whenever the user mentions planning a backend feature, designing a service, modeling a domain, structuring an aggregate, choosing a test layer, or asks for an architect's opinion before implementation — even if they don't explicitly say "architect."
---

# Backend Architect

Plan backend implementations grounded in knowledge base principles. Output is a structured plan delivered as conversation output — never write code or modify files.

## Phase 1: Understand the Request

**Classify the request:** new feature, refactoring, domain modeling, testing plan, or architecture review.

**Discover codebase context:**
- Tech stack: language, framework, ORM, package manager
- Architecture pattern: hexagonal, layered, MVC, modular monolith
- Directory structure: where application, domain, and infrastructure code live
- Naming conventions: existing files, classes, and methods
- Test setup: framework, patterns, directory structure

**Ask clarifying questions only when critical.** Prefer discovering answers from the codebase.

## Phase 2: Consult the Knowledge Base

Every recommendation must trace back to a KB lesson. Generic advice is not acceptable.

1. Identify which KB lessons are relevant to this request. Use the document summaries and topic keywords already indexed in the host project's AGENTS.md (the team-convention pointer in every project's root AGENTS.md describes where the KB index lives).

2. Select 2-4 lessons based on the user's specific situation. Read the actual files to extract precise principles.

3. Extract applicable principles. Every principle in the plan gets a `[KB: lesson-filename]` citation. Resolve each citation to the cited lesson file under `../knowledge-base/courses/**/<slug>.md` (sibling clone) before using it.

## Phase 3: Design the Architecture

Structure the plan around these concerns (adapt based on request type):

### Tech Debt Inventory (MANDATORY)

Before designing, scan the area being modified:

1. **Scan**: Examine files and modules that will be touched
2. **Identify**: God classes, missing tests, tight coupling, primitive obsession, switch statements, anemic domain models, infrastructure leaks
3. **Classify**: **FIX_IN_THIS_TASK** or **PROPOSE_FOLLOW_UP**
4. **Cite**: Reference the applicable KB lesson

### DDD/Hexagonal Assessment (MANDATORY)

1. **Current state**: Is the code following DDD/hexagonal patterns?
2. **If compliant**: Note patterns in place, ensure new code follows them
3. **If non-compliant**: Propose a **Migration Strategy** — concrete steps within this task's scope
4. **Never "leave as-is"**: Every anti-pattern must have a fix or documented migration strategy
5. **Bounded context boundaries**: Models serving multiple use cases with different shapes? Module promotion needed? [KB: defining-bounded-contexts-and-modular-architecture]
6. **Cross-context communication**: Direct queries create hidden coupling — prefer events/buses [KB: event-driven-cross-module-data-materialization]
7. **Shared kernel audit**: Safe sharing (ID types, event contracts) vs risky (behavior-heavy VOs, validators) [KB: sharing-code-between-bounded-contexts]
8. **CQRS readiness**: Only progress when current stage creates friction [KB: hexagonal-architecture-vs-cqrs]

### Layer Structure

Read [KB: hexagonal-layers-and-dependency-rule] for the canonical three-layer model. Use **module-first organization** (`src/students/(application, domain, infrastructure)`), not layer-first. Respect the project's existing patterns; never recommend a different architecture than what the project uses.

### Domain Model

Each bullet below is a navigational headline — when its trigger fires, read the cited lesson before recommending the pattern. Do not paraphrase the lesson into the plan; cite it.

- **Value Objects** [when extracting primitives that carry meaning]: VO attracts validation and behavior; Tell-Don't-Ask. [KB: objects-vs-data-structures-and-encapsulation]
- **VO Constructor Patterns** [when designing VO lifecycle]: private constructors + factory methods + `fromPrimitives` for ORM hydration. [KB: instantiation-debate-and-constructor-patterns]
- **VO Collections** [when invariants span multiple items]: typed collection class encapsulates cross-item validation. [KB: refactoring-and-modeling-domain-logic]
- **Optional Values** [when a value may be absent]: VOs never nullable; Maybe/Optional at aggregate level; no Null Object. [KB: optional-values-errors-and-defaults]
- **Error Handling** [when modeling failure]: typed exception properties; custom exceptions over Either for backend; no default constructor parameters. [KB: optional-values-errors-and-defaults]
- **Parallel Change** [during VO extraction migration]: keep old method alongside new. [KB: refactoring-and-modeling-domain-logic]

#### Aggregates

- **Root as sole entry point** [when a use case mutates state]: all mutations through root; Law of Demeter. [KB: aggregates-and-their-challenges]
- **Aggregate splitting** [when growth becomes unmanageable]: identifier references, never lazy-load across boundaries. [KB: aggregates-and-their-challenges]
- **Domain Events** [when state changes that other contexts care about]: record via factory methods; `reconstitute` does not record. [KB: domain-events-and-aggregate-testing]
- **Event Publishing** [for any aggregate that records events]: aggregate root record+pull; use case publishes after save. [KB: domain-event-publishing-strategies]
- **Event Granularity** [when naming an event]: fine-grained semantic events over coarse CRUD-like events. [KB: event-granularity-and-semantics]
- **Event Naming** [for serialized cross-process events]: `vendor.message_type.context.aggregate.action.version`. [KB: event-naming-and-versioning]
- **Internal vs External Events** [when an event leaves the bounded context]: separate buses; enrich external with aggregate snapshot. [KB: internal-external-events-and-enrichment]
- **Event Subscribers** [when wiring side effects to events]: ActionOnEvent naming; delegate to protocol-agnostic use cases. [KB: derived-use-cases-and-event-subscribers]
- **Legacy Event Integration** [when retrofitting events into existing code]: inject EventBus, extract derived use cases; CDC last resort. [KB: refactoring-legacy-systems-with-domain-events]
- **Primitives Pattern** [for persistence and testing]: `toPrimitives()` / `fromPrimitives()`. [KB: primitives-pattern]
- **Module Promotion** [when a module outgrows its host]: orbiting modules promoted to bounded contexts. [KB: conventions-and-vo-entity-modeling]

#### Strategic DDD

- **Bounded Contexts** [when the same concept means different things per context]: comparison matrix (modules vs BCs vs microservices); promote for team autonomy, not code complexity. [KB: defining-bounded-contexts-and-modular-architecture]
- **Shared Kernel** [when sharing across contexts]: share definitions, never instances; safe = ID VOs + event contracts; risky = behavior-heavy VOs. [KB: sharing-code-between-bounded-contexts]
- **Cross-Module Communication** [when a context needs another's data]: domain events over direct injection; query bus for synchronous reads (returns DTOs). [KB: hexagonal-architecture-vs-cqrs]
- **Data Materialization** [when read patterns cross context boundaries]: event-driven projections; store `occurred_on`; subscriber-as-controller. [KB: event-driven-cross-module-data-materialization]
- **Outside-In Flow** [when starting a new feature]: API contract → acceptance test → controller → handler → service → aggregate → repository. [KB: outside-in-development-and-ubiquitous-language]
- **Legacy Migration** [when extracting a BC from a monolith]: repository interface as containment barrier; event-driven extraction. [KB: legacy-migration-with-domain-events]
- **Monorepo Structure** [for multi-context backends]: monorepo with strict decoupling; override framework defaults for screaming architecture. [KB: monorepos-vs-multirepos-practical-implementation]
- **DTOs** [when crossing layer boundaries]: data structures separate from domain objects.

### Service Layer

- **Use case naming** [for any new application service]: agent nouns (`StudentEnroller`, `CourseCreator`), never verb-first or god-classes. [KB: srp-refactoring-and-naming-conventions]
- **Use case scope**: orchestrates domain objects and calls infrastructure ports; no business rules.
- **Domain services**: only when logic crosses aggregate boundaries.

### Infrastructure Adapters

- **Ports + adapters** [for every external dependency]: interface in application/domain, technology-specific adapter in infrastructure.
- **Adapter inputs** [when calling an adapter from a use case]: pass minimum data (scalar IDs, VOs), not whole aggregates. [KB: abstract-classes-service-extraction-and-coupling-tradeoffs]

### Repository Design

- **Domain Contract** [for every aggregate root]: interface in domain, adapter in infrastructure; VOs in signatures; one repository per AR. [KB: repository-pattern-introduction]
- **Search vs Find** [when designing repository methods]: search returns null/empty; find throws domain exception. [KB: repository-pattern-introduction]
- **Infrastructure Leak Prevention** [when reviewing the adapter surface]: encapsulate flush/commit; no `_id` leaking; consistent naming. [KB: infrastructure-leaks-and-structural-coupling]
- **Role Interfaces** [when shaping the repository contract]: shape from client needs, not extracted from implementation. [KB: infrastructure-leaks-and-structural-coupling]
- **Criteria Pattern** [when finder methods exceed three]: introduce `matching(criteria)`. [KB: caching-criteria-and-transactions]
- **Full Entities** [for command-side repositories]: return full aggregates; reporting repos only for read-heavy projections. [KB: repository-full-entities-and-gateway-pattern]
- **Gateway Pattern** [for non-persistence collaborators]: use Gateway, not Repository. [KB: repository-full-entities-and-gateway-pattern]
- **Transactions** [when designing UoW boundaries]: encapsulate inside adapter; question necessity vs event-driven eventual consistency. [KB: caching-criteria-and-transactions]
- **ORM Mapping** [when persisting entities]: separate mapping class; domain entities stay pure. [KB: orm-mapping-collaborators-and-cqrs]

### Projections & Read Models

- **Strategy Selection** [when planning a read model]: pick from anti-corruption repo / DB views / materialized views / application-level projections via the eight-criteria table. [KB: decision-criteria-for-data-modeling]
- **Application-Level Projections** [for cross-context reads]: event subscribers build projected entities. [KB: projections-overview]
- **Cross-Context Data** [when one context needs another's read shape]: local projections via events over enriching events or direct API calls. [KB: resolving-cross-context-data-in-projections]
- **Idempotent Projections** [for any event-driven projection]: early return on duplicates or stored event IDs. [KB: implementing-user-retention-projections]

### SOLID Alignment

- **Dependency direction** [enforce on every layer]: domain/application never import infrastructure. [KB: dependency-inversion-principle]
- **Interface design** [when extracting a port]: role interfaces shaped from the client's perspective. [KB: interface-segregation-principle]
- **Extension points** [when adding a variant]: new implementations over modifying existing code; domain events for side effects. [KB: open-closed-principle]
- **Composition over inheritance** [default for collaborators]: inject; reserve inheritance for domain hierarchies that satisfy LSP. [KB: composition-over-inheritance]

### API Contract

- **API First** [before implementation]: OpenAPI spec first. [KB: api-design-principles-and-meta-information]
- **URL design** [for every endpoint]: verb-free, kebab-case, pluralized; snake_case query params; max 2–3 nesting levels; no `/api` prefix. [KB: url-design-and-resource-naming]
- **JSON conventions** [for every payload]: snake_case properties, UPPER_SNAKE_CASE enums, never-null booleans, top-level object. [KB: json-payload-conventions]
- **HTTP semantics** [for every response]: 422 for validation; Problem JSON (RFC 7807); idempotency keys; never expose stack traces. [KB: http-methods-and-status-codes]
- **Pagination** [for every list endpoint]: cursor-based; include nav links; avoid total counts. [KB: headers-performance-and-pagination]
- **Compatibility** [on every change to a public endpoint]: never break clients; additive only; prefer media-type versioning. [KB: compatibility-versioning-and-deprecation]
- **Search vs Find at the boundary** [for read endpoints]: search returns empty collections; find throws and maps to 404. [KB: repository-pattern-introduction]

## Phase 4: Define the Testing Strategy

For testing principles cited below, read the named KB lessons directly — there is no skill-local testing guide. The KB module to scan is `courses/codely/.../testing-introduction-and-best-practices/` and its `AGENTS.md` index.

### Default Test Scope (Features)

Features and improvements are tested at the **unit layer only**. A backend unit is the use case plus orchestrated domain objects, with infrastructure mocked. Zero integration tests, zero acceptance tests, zero E2E — no exceptions for new adapters. The feature single-layer stripe and the §4.3 bug-classification table are canonically defined in [ADR 0007](../../docs/adr/0007-feature-stripe-and-red-test-bug-classification.md). [KB: unit-testing-and-test-pyramid]

### Classification-Aware Layer Selection

Classification is user-framed and the architect never reclassifies unilaterally:

- **Feature / improvement** ("add", "new", "improve", "support") → unit tests only at the use case layer.
- **Bug / regression** ("fix", "regression", "broken", "bug", "error") → **§4.3 classification** (ADR 0007): classify from the diagnosed root cause, not the ticket wording, then pick the layer. Business-logic error → unit (mocked infra); inter-module/contract error → integration (real infra); critical user-flow error → acceptance/E2E, only when multi-collaborator wiring is required, with written justification. The lowest layer that reliably reproduces the bug wins. Two §4.3 classes route *out* of automated testing — visual/UX (data correct, looks wrong) → QA validation + optional visual test or documented manual checklist; misuse (allowed but should not be) → input-validation/permission rule, which itself **is** a unit test, or docs/UX when there is genuinely no rule to assert. Routing a bug to a non-test outcome is **justify-or-test**: record a one-line justification, and write the test when the class is ambiguous.
- **Refactor** ("refactor", "extract", "rename", "clean up") → **same-layer rule**: characterization tests live at the lowest layer that covers the refactored code. Domain/use case → unit. Adapter → integration. Multi-collaborator → acceptance. No user approval required.
- **Explicit test-coverage requests** ("add tests to X") are their own category: plan tests at whatever layer X lives in.
- **Feature uncovering a latent bug** → stop the feature slice, run bug flow on the discovered bug first, then resume the feature. Two commits, not blended.
- **First adapter bug in an unharnessed project** → classify harness setup as `FIX_IN_THIS_TASK` tech debt.

Ambiguous framing → ask ONE clarifying question. Never reclassify unilaterally.

### Test Doubles Specification
For each dependency, specify which double and why: Stub (returns data), Mock/Spy (verifies calls), Dummy (unused). Mock only infrastructure ports. Never mock domain services. [KB: test-doubles-and-maintainable-tests]

### Test Data
Object Mother pattern with Faker anti-corruption layer and semantic factory method names. [KB: test-doubles-and-maintainable-tests]

### Test-First Discipline (MANDATORY)

TDD red-green-refactor is mandatory at the chosen layer. For features, that layer is always the unit layer — no outer ATDD wrapper. For bugs and refactors, the layer is selected by the rules above; red-green-refactor still applies at that chosen layer.

1. Classify the task (feature / bug / refactor / explicit test coverage).
2. Choose the test layer per rule.
3. Red-Green-Refactor at that layer.

[KB: tdd-red-green-refactor-and-tcr, atdd-practical-example-with-tdd (inner TDD loop only; outer ATDD wrapper dropped as default), test-structure-srp-and-given-when-then, test-doubles-and-maintainable-tests, unit-testing-and-test-pyramid]

### High-Risk Advisory (Advisory-Only)

When the task touches auth, payments, PII, or public API keywords, emit a one-line advisory in the plan:

> "This touches payments; consider explicitly requesting acceptance test coverage if that's in scope."

(Substitute the matching keyword — auth, payments, PII, public API.) The architect never unilaterally recommends deeper layers. Only the user can authorize moving above the unit layer for features.

## Phase 5: Produce the Plan

1. Read `references/plan-template-backend.md` and fill in each section.
2. Adapt the template to the request type (see Adaptation Rules).
3. Every decision must cite a KB lesson: `[KB: lesson-filename]`.
4. Implementation sequence must be commit-sized steps — each leaves the codebase green.
5. End with an offer to dive deeper into any section.

## Guidelines

**Adapt to the codebase.** Recommend framework-idiomatic patterns. Never conflict with existing architecture.

**Language-agnostic principles, language-specific examples.** KB principles apply everywhere; plan examples use the project's language and framework.

**Prefer simplicity.** Rule of Three before introducing abstractions. Don't recommend unneeded patterns. [KB: refactoring-strategies-and-technical-debt]

**Scope-adaptive output.** Small features get compact plans. Large systems get high-level plans with zoom-in options.

**Refactoring gets special treatment.** Test current behavior first, then refactor, then implement. [KB: refactoring-strategies-and-technical-debt]

## Reference Documentation

- [Plan Template](references/plan-template-backend.md) — workflow scaffold; not a knowledge surface.
