# Implementation Checklist

Verify each applicable item after implementation. Skip items that don't apply to the task and note why in your report.

---

## Domain Model

- [ ] Primitives with meaning extracted as Value Objects (Money, Email, Capacity, etc.)
- [ ] VOs contain their own validation — invalid state is impossible to construct
- [ ] VOs attract related behavior (magnet effect) — formatting, comparison, arithmetic lives on the VO
- [ ] Tell-Don't-Ask applied — behavior lives on the object that owns the data, not on the caller
- [ ] Entities enforce their invariants — invalid state transitions are rejected
- [ ] DTOs are separate from domain objects — they exist only for boundary crossing
- [ ] Boolean arguments avoided — specialized methods used instead of flag parameters
- [ ] VO constructor receives primitives — private constructor + lifecycle factory methods (`create`, `reconstitute`)
- [ ] `fromPrimitives` static method exists for ORM hydration / deserialization
- [ ] Primitive getters for serialization — VOs are opaque outside the domain
- [ ] VO collections encapsulate cross-item validation (e.g., `Students` enforces capacity)
- [ ] Contextual VO naming — `UserEmail` not `Email`, scoped to the module
- [ ] Parallel change applied when extracting VOs from primitives — old method kept alongside new during migration

[KB: objects-vs-data-structures-and-encapsulation, avoiding-boolean-arguments-and-default-values, value-objects-before-after-benefits, refactoring-and-modeling-domain-logic, instantiation-debate-and-constructor-patterns]

## Naming

- [ ] Use case classes named as agent nouns: `StudentEnroller`, `CourseCreator`, not `EnrollStudent` or `StudentService`
- [ ] One use case per class — no god-classes with multiple unrelated methods
- [ ] Boolean variables/methods use is/has/can prefix
- [ ] No "Impl" suffix on implementation classes — name describes the specific implementation
- [ ] Context-aware naming — variable names make sense without reading surrounding code

[KB: srp-refactoring-and-naming-conventions, clean-code-practices-in-user-controller-design]

## Service Layer

- [ ] Use cases orchestrate domain objects and call infrastructure ports — they don't contain business rules
- [ ] Business rules live in entities and VOs, not in use cases
- [ ] Domain services only exist when logic crosses aggregate boundaries or needs external data
- [ ] Dependencies injected via constructor, not created internally

[KB: srp-refactoring-and-naming-conventions, abstract-classes-service-extraction-and-coupling-tradeoffs]

## SOLID Design

- [ ] No STUPID anti-patterns (Singleton as global state, tight coupling, untestable code, premature optimization, indescriptive naming, duplication)
- [ ] SRP "and" test: class description doesn't need "and" — if it does, split it
- [ ] OCP: new behavior via new implementations, not editing switch/if-else chains
- [ ] LSP: subtypes honor parent contracts — no surprising exceptions or missing behavior
- [ ] ISP: role interfaces shaped by client needs, no unused method dependencies
- [ ] DIP: import check heuristic — domain and application layers never import infrastructure
- [ ] Composition over inheritance for services and controllers — inheritance reserved for domain model hierarchies
- [ ] Classes `final` by default (Java, PHP, Scala) — only open for inheritance when explicitly designed for extension

[KB: introduction-to-solid-and-stupid-principles, single-responsibility-principle, open-closed-principle, liskov-substitution-principle, interface-segregation-principle, dependency-inversion-principle, composition-over-inheritance]

## Infrastructure

- [ ] Ports (interfaces) defined for each external dependency
- [ ] Adapters implement ports using specific technology
- [ ] Minimum data passed to adapters — scalar IDs and VOs preferred over whole aggregates
- [ ] Search endpoints return empty collections (no exception)
- [ ] Find endpoints throw domain exception when not found (mapped to 404 at boundary)
- [ ] Module-first directory organization: `src/[module]/(application, domain, infrastructure)`

[KB: atdd-practical-example-with-tdd (inner TDD loop only), abstract-classes-service-extraction-and-coupling-tradeoffs]

## API Design

- [ ] Paths are verb-free — no `/getUsers` or `/createOrder`
- [ ] Paths use kebab-case — `/order-items` not `/orderItems` or `/order_items`
- [ ] Resource names are pluralized — `/students` not `/student`
- [ ] No `/api` prefix in paths — use host-based separation instead
- [ ] Path nesting max 2-3 levels — `/courses/{id}/students` not deeper
- [ ] Query parameters use snake_case — `?sort_by=name` not `?sortBy=name`
- [ ] JSON properties use snake_case — `first_name` not `firstName`
- [ ] Enum values use UPPER_SNAKE_CASE — `ORDER_CONFIRMED` not `orderConfirmed`
- [ ] Boolean properties are never null — default to `false` if not set
- [ ] Empty arrays returned as `[]`, never as `null`
- [ ] Response body is always a top-level JSON object — no bare arrays or primitives
- [ ] Money amounts use a structured object with `amount` and `currency` fields
- [ ] Validation errors return 422 (not 400) with Problem JSON format (RFC 7807)
- [ ] Error responses never expose stack traces, SQL, or file paths
- [ ] List endpoints are paginated — cursor-based preferred over offset-based
- [ ] Pagination responses include `next`/`prev` navigation links
- [ ] No breaking changes to existing API contracts — additive changes only
- [ ] Fields are never removed or renamed — deprecated fields continue to be served

[KB: url-design-and-resource-naming, json-payload-conventions, http-methods-and-status-codes, headers-performance-and-pagination, compatibility-versioning-and-deprecation]

## Error Handling

- [ ] Domain exceptions carry typed context properties — `CourseNotFound(courseId)` not `Error('not found')`
- [ ] No generic `Error`/`Exception` thrown from domain or application layer
- [ ] VOs are never nullable — aggregate-level Maybe/Optional for optional fields
- [ ] No Null Object pattern — it hides missing data behind silent behavior
- [ ] No default parameters in domain constructors — factory methods restrict API surface instead
- [ ] Either monad considered for functional pipelines; custom exceptions preferred for most backend services

[KB: optional-values-errors-and-defaults]

## Code Quality

- [ ] Guard clauses used instead of nested if-else
- [ ] Functions at a single level of abstraction
- [ ] No premature abstractions — Rule of Three before extracting a pattern
- [ ] Comments only for "why", never for "what" — code is self-documenting
- [ ] Follows existing codebase formatting and linting rules

[KB: introduction-to-clean-code-and-refactoring-practices, code-formatting-and-linting-conventions]

## Simple Design

- [ ] Factory methods used for domain object creation — no builder pattern for objects with required-only fields
- [ ] Private methods preferred until a third use case needs the same logic (Rule of Three)
- [ ] No speculative repository methods, enum values, or database indexes beyond current needs
- [ ] Interfaces only where justified: test doubles for I/O boundaries, programmatic introspection
- [ ] No generic UseCase interface, no use case interface with a single implementation
- [ ] Duplication type assessed before extraction — literal extracts, structural may need snapshots, conceptual may be intentional

[KB: four-rules-overview, yagni-and-premature-abstractions, code-duplication-types-and-strategies]

## Testing

Classification-aware. Pick the test layer from the user-framed classification before writing any test. Never mock domain services; mock only infrastructure ports.

### Default: Features → Unit Tests Only

- [ ] Task classified as feature / improvement (user framing: "add", "new", "improve", "support")
- [ ] Failing unit test written before production code (Red-Green-Refactor at the unit layer)
- [ ] One test class per use case, mocking only infrastructure dependencies
- [ ] "Unit" = use case + domain objects it orchestrates, not individual class
- [ ] Test doubles correctly chosen: Stub (returns data), Spy (records calls), Dummy (unused) — mock only infra ports, never domain services
- [ ] Object Mother pattern for test data with semantic factory methods
- [ ] One Mother per VO — `UserIdMother`, `UserEmailMother`; entity Mothers delegate to VO Mothers
- [ ] Partial params via Faker — override only relevant fields, rest random
- [ ] Faker anti-corruption layer — `UuidMother.random()` wraps `faker.string.uuid()`; domain Mothers never call Faker directly
- [ ] Mothers extract `.value` — entity receives primitives from VO Mothers
- [ ] Given-When-Then structure in every test
- [ ] One scenario per test — if a requirement breaks, exactly one test fails
- [ ] Test folder structure mirrors application architecture
- [ ] Zero integration / acceptance / E2E tests written for the feature (adapters may be written, but not tested)
- [ ] High-risk advisory acknowledged when architect flagged auth / payments / PII / public API

### Bug Flow: §4.3 Red-Test Classification

- [ ] Task classified as bug (user framing: "fix", "regression", "broken", "bug", "error")
- [ ] Bug classified from its diagnosed root cause (not the ticket wording) and the layer picked from the §4.3 table in ADR 0007 — business-logic → unit (mocked infra); inter-module/contract → integration (real infra); critical user-flow → acceptance/E2E with written justification; the lowest layer that reliably reproduces the bug wins
- [ ] Visual/UX and misuse §4.3 rows handled via justify-or-test: a misuse fix that is an input-validation/permission rule still gets a unit test; a no-rule case carries a one-line written justification instead
- [ ] Red test fails before the fix, then passes after the fix
- [ ] First adapter bug in an unharnessed project → harness setup recorded as `FIX_IN_THIS_TASK` tech debt

### Refactor Flow: Same-Layer Characterization Tests

- [ ] Task classified as refactor (user framing: "refactor", "extract", "rename", "clean up")
- [ ] Characterization tests at the same layer as the refactored code — domain/use case → unit; adapter → integration; multi-collaborator → acceptance
- [ ] Characterization tests pass before refactor starts and stay green throughout

### Explicit Test-Coverage Requests

- [ ] Task classified as explicit test-coverage request ("add tests to X")
- [ ] Tests written at whatever layer X lives in

[KB: unit-testing-and-test-pyramid, test-doubles-and-maintainable-tests, test-structure-srp-and-given-when-then, testing-with-object-mothers, tdd-red-green-refactor-and-tcr, atdd-practical-example-with-tdd]

## Refactoring (when applicable)

- [ ] Preparatory refactoring workflow followed: test existing behavior → refactor → implement new feature
- [ ] Refactoring and feature work in separate commits
- [ ] Tests stay green throughout refactoring — no "trust me it'll work when I'm done"
- [ ] Scout Rule applied — leave code cleaner than you found it (within scope)

[KB: refactoring-strategies-and-technical-debt]

## Strict Mode Gates (MANDATORY)

These gates are verified by the reviewer. Failing any gate triggers the fix-review loop.

- [ ] **Tech debt reduction**: Tech debt inventory exists, all FIX_IN_THIS_TASK items resolved, area is measurably cleaner than before
- [ ] **Clean code**: Guard clauses used (no nested if-else), functions at single abstraction level, meaningful names, no "what" comments
- [ ] **Test-First Discipline at Chosen Layer**: Failing test at the chosen layer written before production code (red-green-refactor at feature/bug/refactor layer)
- [ ] **Test pyramid**: Unit tests for every feature change; deeper layers only for bugs requiring real infra or refactors whose characterization lives at that layer
- [ ] **DDD/Hexagonal**: New code follows DDD/hexagonal patterns; non-compliant areas have a documented migration strategy
- [ ] **Migration strategies**: Every identified anti-pattern has either a fix in this task or a documented follow-up strategy — never "leave as-is" without justification
- [ ] **Overall compliance**: All 6 gates above pass — the reviewer verifies this as a mandatory final check
