# Review Checklist

Assessment rubric for code reviews. Walk through each applicable section — skip sections that don't apply and note why.

---

## Domain Model (Backend)

- [ ] Primitives with meaning extracted as Value Objects (Money, Email, Capacity)
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

## Components (Frontend)

- [ ] Each component has a single responsibility — one reason to change
- [ ] Server Components by default; `'use client'` only for hooks, browser APIs, or event handlers
- [ ] `'use client'` boundaries pushed to the leaves of the component tree
- [ ] Props interfaces defined with TypeScript — no `any`, no inline object types
- [ ] Boolean props use is/has/can prefix
- [ ] No boolean arguments controlling branching — use specialized components instead
- [ ] Guard clauses for early returns (loading, error, empty states) before main render

[Vercel: server-serialization, rerender-memo | KB: clean-code-practices-in-user-controller-design, avoiding-boolean-arguments-and-default-values]

## Naming (Universal)

- [ ] Use case classes named as agent nouns: `StudentEnroller`, `CourseCreator` — not verb-first or god-class
- [ ] Boolean variables/methods use is/has/can prefix
- [ ] No "Impl" suffix — name describes the specific implementation
- [ ] Context-aware naming — variable names make sense without reading surrounding code
- [ ] Component/hook names describe what they render/manage
- [ ] Event handlers: `on` prefix for props, `handle` prefix for functions

[KB: srp-refactoring-and-naming-conventions, clean-code-practices-in-user-controller-design]

## Service Layer (Backend)

- [ ] Use cases orchestrate domain objects and call infrastructure ports — no business rules in use cases
- [ ] Business rules live in entities and VOs, not in use cases
- [ ] One use case per class — no god-classes with multiple unrelated methods
- [ ] Dependencies injected via constructor, not created internally

[KB: srp-refactoring-and-naming-conventions, abstract-classes-service-extraction-and-coupling-tradeoffs]

## SOLID Design (Backend)

- [ ] No STUPID anti-patterns (Singleton as global state, tight coupling, untestable code, premature optimization, indescriptive naming, duplication)
- [ ] SRP: each class has one reason to change — apply the "and" test to class descriptions
- [ ] OCP: new behavior introduced via new types, not by editing switch/if-else chains
- [ ] LSP: subtypes honor parent contracts — no surprising exceptions or missing behavior
- [ ] ISP: interfaces shaped by client needs (role interfaces), not by implementation convenience
- [ ] DIP: import check heuristic — domain and application layers never import infrastructure
- [ ] Composition over inheritance for services and controllers — inheritance reserved for domain model hierarchies
- [ ] Repository interfaces minimal: save, search, searchByCriteria — no method explosion per query variation

[KB: introduction-to-solid-and-stupid-principles, single-responsibility-principle, open-closed-principle, liskov-substitution-principle, interface-segregation-principle, dependency-inversion-principle, composition-over-inheritance, criteria-pattern]

## State Management (Frontend)

- [ ] Derived state calculated during render, never synced with useEffect + setState
- [ ] Functional setState used for updates depending on previous state
- [ ] Lazy state initialization for expensive computations
- [ ] Refs used for transient values that don't trigger re-renders
- [ ] No unnecessary global state — local state + prop drilling unless truly shared

[Vercel: rerender-derived-state-no-effect, rerender-functional-setstate, rerender-lazy-state-init]

## Data Fetching (Frontend)

- [ ] Parallel fetching for independent data: Promise.all() or sibling Server Components
- [ ] Suspense boundaries wrapping async Server Components for streaming
- [ ] React.cache() for per-request deduplication in Server Components
- [ ] Minimum data serialized from Server to Client Components
- [ ] Loading and error states handled — Suspense fallbacks + error boundaries

[Vercel: async-parallel, async-suspense-boundaries, server-cache-react, server-serialization]

## Infrastructure (Backend)

- [ ] Ports (interfaces) defined for each external dependency
- [ ] Adapters implement ports using specific technology
- [ ] Minimum data passed to adapters — scalar IDs and VOs preferred over whole aggregates
- [ ] Search endpoints return empty collections (no exception)
- [ ] Find endpoints throw domain exception when not found (mapped to 404 at boundary)
- [ ] Async operations on collections use `Promise.all()` for independent items, not sequential `await` in `for` loops

[KB: atdd-practical-example-with-tdd, abstract-classes-service-extraction-and-coupling-tradeoffs]

## API Design (Backend)

- [ ] Paths are verb-free — flag `/getUsers`, `/createOrder`, or any verb in the URL path
- [ ] Paths use kebab-case — flag camelCase (`/orderItems`) or snake_case (`/order_items`) in paths
- [ ] Resource names are pluralized — flag singular resource names (`/student` instead of `/students`)
- [ ] No `/api` prefix in paths — flag `/api/v1/...` patterns, recommend host-based separation
- [ ] Path nesting max 2-3 levels — flag deep nesting like `/courses/{id}/students/{id}/grades/{id}`
- [ ] Query parameters use snake_case — flag camelCase query params (`?sortBy=name`)
- [ ] JSON properties use snake_case — flag camelCase (`firstName`) in request/response bodies
- [ ] Enum values use UPPER_SNAKE_CASE — flag camelCase or lowercase enum values
- [ ] Boolean properties are never null — flag nullable booleans in response schemas
- [ ] Empty arrays returned as `[]`, never as `null` — flag null array responses
- [ ] Response body is always a top-level JSON object — flag bare array or primitive responses
- [ ] Money amounts use structured object with `amount` and `currency` — flag raw numeric amounts
- [ ] Validation errors return 422 (not 400) with Problem JSON format (RFC 7807) — flag generic 400 for validation
- [ ] Error responses never expose stack traces, SQL, or file paths — flag any leaked internals
- [ ] List endpoints are paginated — flag unbounded list responses
- [ ] Pagination uses cursor-based approach — flag offset-based without justification
- [ ] Pagination responses include `next`/`prev` navigation links — flag missing nav links
- [ ] No breaking changes — flag removed/renamed fields, removed endpoints, or changed status codes
- [ ] Flag URL versioning (`/v1/`) — recommend media-type versioning or compatible extensions instead
- [ ] Flag closed enums without extensibility strategy — recommend open enums or `x-extensible-enum`
- [ ] Avoid total count in pagination — flag `total_count` without performance justification

[KB: url-design-and-resource-naming, json-payload-conventions, http-methods-and-status-codes, headers-performance-and-pagination, compatibility-versioning-and-deprecation]

## Error Handling (Backend)

- [ ] Generic exceptions (`Error`, `Exception`, `RuntimeException`) not thrown from domain or application layer — domain-specific exceptions used instead
- [ ] Domain exceptions carry context: what failed, which entity, which value (e.g., `CourseNotFound(courseId)` not `Error('not found')`)
- [ ] Adapter boundaries wrap infrastructure exceptions into domain exceptions — callers never see database, HTTP, or filesystem errors
- [ ] Exception types follow location conventions: domain exceptions in domain layer, application exceptions in application layer
- [ ] HTTP status mapping happens at the boundary (controller/middleware), not inside use cases or domain
- [ ] Error responses include enough information for the client without leaking internals (no stack traces, no SQL, no file paths)
- [ ] VOs are never nullable — aggregate-level Maybe/Optional for optional fields
- [ ] No default parameters in domain constructors — factory methods restrict API surface instead
- [ ] No Null Object pattern — it hides missing data behind silent behavior

[KB: atdd-practical-example-with-tdd, introduction-to-solid-and-stupid-principles, optional-values-errors-and-defaults]

## Code Quality (Universal)

- [ ] Guard clauses used instead of nested if-else
- [ ] Functions at a single level of abstraction
- [ ] No premature abstractions — Rule of Three before extracting a pattern
- [ ] Comments only for "why", never for "what"
- [ ] Follows existing codebase formatting and linting rules

[KB: introduction-to-clean-code-and-refactoring-practices, code-formatting-and-linting-conventions]

## Performance (Frontend)

- [ ] Direct imports from specific module paths — no barrel file imports
- [ ] Dynamic imports for heavy components not needed on initial render
- [ ] React.memo only for components with expensive rendering and frequent re-renders
- [ ] Static JSX hoisted outside components
- [ ] Conditional rendering uses ternary, not &&
- [ ] Third-party scripts deferred after hydration

[Vercel: bundle-barrel-imports, bundle-dynamic-imports, rerender-memo, rendering-hoist-jsx, rendering-conditional-render]

## Simple Design (Universal)

- [ ] No premature abstractions — interfaces, base classes, or shared utilities justified by real benefit
- [ ] Factory methods preferred over builder pattern for domain objects with required fields
- [ ] Rule of Three applied — shared abstractions have at least three consumers
- [ ] YAGNI: no speculative methods, enum states, config options, or indexes beyond current requirements
- [ ] Duplication type correctly handled: literal extracted, structural may need snapshots, conceptual may be intentionally preserved
- [ ] Tests hardcode expected values rather than sharing references with production code (SSOT exception)
- [ ] No fragile spy-based tests that break on private method renames — tests verify behavior through collaborator boundaries

[KB: four-rules-overview, yagni-and-premature-abstractions, code-duplication-types-and-strategies, fragile-tests-and-bug-reproduction]

## Testing (Universal)

- [ ] Layer selection matches classification: feature → unit/component only (single-layer stripe); bug → §4.3 red-test classification, lowest layer that reproduces the root cause (see ADR 0007); refactor → same layer covering the refactored code. Deeper layers appear only with written justification.
- [ ] Every test follows Given-When-Then structure with descriptive names
- [ ] Test doubles correctly chosen: stubs for reads, spies for writes, dummies for unused deps
- [ ] Object Mother pattern for test data with semantic factory methods — no inline magic values
- [ ] One Mother per VO — `UserIdMother`, `UserEmailMother`; entity Mothers delegate to VO Mothers
- [ ] Partial params via Faker — override only relevant fields, rest random
- [ ] Faker anti-corruption layer — domain Mothers wrap Faker, never call it directly
- [ ] Mothers extract `.value` — entity receives primitives from VO Mothers
- [ ] No shared mutable state between tests — no implicit setUp() coupling
- [ ] Time dependencies handled via clock injection, not global patching
- [ ] One scenario per test — if a requirement breaks, exactly one test fails
- [ ] Missing coverage identified: error cases, edge conditions, state transitions

[KB: unit-testing-and-test-pyramid, test-doubles-and-maintainable-tests, semantic-testing-and-given-when-then-methods, flaky-tests-and-time-dependent-testing, testing-with-object-mothers]

## Frontend Testing Quality

- [ ] Queries use `screen` object — no `container.querySelector` or destructured queries from `render()`
- [ ] Query variant matches intent: `getBy` for elements that must exist, `queryBy` for asserting absence, `findBy` for async appearance
- [ ] User Event (`userEvent`) used for interactions — `fireEvent` only when User Event doesn't support the event type
- [ ] No arbitrary `sleep()` or `setTimeout()` in tests — use `findBy*`, `waitFor`, or `waitForElementToBeRemoved` for async content
- [ ] No side effects inside `waitFor` callbacks — only assertions, not clicks or state changes that would repeat on each poll
- [ ] Test setup is explicit per test — no shared `beforeEach` that hides test context. Use Page Object or helper functions instead of shared mutable state
- [ ] Query priority follows Testing Library pyramid: getByRole > getByLabelText > getByText > getByTestId
- [ ] Global store tests use real store instance (Vuex/Redux), not mocked store — custom render function injects store and plugins
- [ ] Test Object Factories (Fishery/Faker) used for test data — no inline magic values, Faker wrapped behind domain Mothers
- [ ] Snapshot tests justified — not used as default assertion strategy. Acceptable only for legacy safety nets or presentational components with stable markup
- [ ] Fake timers used for polling/setInterval — `useFakeTimers` + `runOnlyPendingTimers`, not real delays
- [ ] Component unmount cleans up intervals — no ghost intervals leaking between tests or in production SPAs
- [ ] CI pipeline enforces test execution on PRs via required status checks

[KB: common-testing-errors-and-best-practices, mocking-strategies-jest-and-msw, global-store-test-factories-and-snapshots, tdd-live-coding-comments-and-polling, implementing-ci-with-github-actions]

## Refactoring (When Applicable)

- [ ] Preparatory refactoring workflow: characterization tests → refactor → implement
- [ ] Refactoring and feature work in separate commits
- [ ] Tests stay green throughout refactoring
- [ ] Scout Rule applied — leave code cleaner than you found it (within scope)

[KB: refactoring-strategies-and-technical-debt]

## Common False Positives

Before reporting a finding, check if it falls into one of these categories — they are often flagged incorrectly:

- **Pre-existing issues:** The pattern existed before the diff. Unless the PR touches the code, don't flag it — the author is not responsible for legacy debt in unmodified lines.
- **Style conflicts with codebase conventions:** If the codebase consistently uses a pattern that differs from KB recommendations (e.g., different naming convention), follow the codebase convention. Note the deviation as a Suggestion at most.
- **Intentional duplication:** Two similar code blocks that serve different domains or bounded contexts may be intentionally duplicated to avoid coupling. Apply the Rule of Three — don't flag duplication with fewer than three instances.
- **Missing abstraction (YAGNI):** A pattern used only once or twice does not need an abstraction. Don't recommend extracting interfaces, base classes, or utilities without three real consumers.
- **Verbose test setup:** Tests that explicitly set up their own state (rather than sharing setup) are following isolation best practices, not being unnecessarily verbose.
- **Direct dependency in integration tests:** Integration tests are expected to use real implementations (database, HTTP clients). Flagging "missing port" in an integration test is incorrect — ports are for unit tests.

## Strict Mode Gates (MANDATORY — Always Assessed)

These gates are non-negotiable. Every review must verify them regardless of task size or type.

### Tech Debt

- [ ] Tech debt inventory exists (from architect plan or developer pre-flight)
- [ ] All FIX_IN_THIS_TASK items were actually resolved in the implementation
- [ ] Modified area is measurably cleaner than before the changes
- [ ] New tech debt items discovered during implementation are classified as PROPOSE_FOLLOW_UP

### Clean Code

- [ ] Guard clauses used instead of nested if-else in all new code
- [ ] Functions/components operate at a single level of abstraction
- [ ] Meaningful, context-aware naming throughout new code
- [ ] No "what" comments — only "why" comments where non-obvious

### Test-First Discipline at Chosen Layer

- [ ] Task classification (feature / bug / refactor / explicit coverage) is user-framed and not unilaterally reassigned by the agent
- [ ] A failing test at the chosen layer preceded production code (feature → unit/component; bug → §4.3 layer; refactor → same layer covering the refactored code) — or, for a bug whose §4.3 class routes out of automated testing (visual/UX, or misuse with no assertable rule), a one-line justify-or-test justification
- [ ] Red-green-refactor cycle followed at that layer — verify via git history, file timestamps, or test-first commit pattern
- [ ] Correct feature implementations with only unit/component tests are NOT flagged — missing acceptance/E2E tests for a feature are not a failure
- [ ] High-risk areas (auth / payments / PII / public API) have either an acknowledged architect advisory or an explicit user request for deeper layers — the advisory alone does not force deeper tests

### Test Pyramid (Single-Layer Stripe)

- [ ] Unit/component tests exist for every feature change — the default is a single-layer stripe
- [ ] Deeper layers (integration, acceptance, E2E) appear ONLY when a bug reproduces there or a refactor's characterization lives there, with written justification
- [ ] Visual/UX and misuse-without-a-rule bugs (§4.3 rows 4-5, ADR 0007) carry a justify-or-test justification instead of an automated test
- [ ] First adapter bug / first composition bug in an unharnessed project classified the harness setup as `FIX_IN_THIS_TASK` tech debt
- [ ] Infrastructure adapters are still written in feature slices — they are just not tested at integration level by default

### Architecture

- [ ] New code follows DDD/hexagonal patterns (backend) or recommended frontend patterns (Server Components default, proper client boundaries)
- [ ] Non-compliant areas have a documented migration strategy
- [ ] Every identified anti-pattern has either a fix or a documented follow-up strategy
- [ ] No anti-patterns left as "leave as-is" without justification
