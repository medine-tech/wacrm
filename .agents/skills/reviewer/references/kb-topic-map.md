# KB Topic Map

Maps code review concerns to specific knowledge base lessons and Vercel rules. Use this to identify which files to read based on the code being reviewed.

## Base Paths

```
CLEAN_CODE     = courses/codely/software-design-and-architecture/maintainable-software-fundamentals/clean-code
TESTING        = courses/codely/software-design-and-architecture/software-architecture/testing-introduction-and-best-practices
OOP_PRACTICES  = courses/codely/software-design-and-architecture/oop-best-practices
VERCEL_RULES   = ../vercel-react-best-practices/rules
FEEDBACK       = courses/manager-pro-team
FOUR_RULES     = courses/codely/software-design-and-architecture/four-rules-of-simple-design
SOLID_PRINCIPLES = courses/codely/software-design-and-architecture/maintainable-software-fundamentals/applied-solid-principles
VALUE_OBJECTS  = courses/codely/software-design-and-architecture/domain-modeling/value-objects
AGGREGATES     = courses/codely/software-design-and-architecture/domain-modeling/aggregates
REPOSITORIES   = courses/codely/software-design-and-architecture/domain-modeling/repositories
ZALANDO_API    = courses/zalando/restful-api-guidelines
CHANGE_PREVENTERS = courses/codely/software-design-and-architecture/code-smells-change-preventers
DOMAIN_EVENTS  = courses/codely/software-design-and-architecture/domain-modeling/domain-events
PROJECTIONS    = courses/codely/software-design-and-architecture/domain-modeling/projections
CC_RULES       = ../clean-code-best-practices/rules
API_RULES      = ../rest-api-best-practices/rules
HEXAGONAL      = courses/codely/software-design-and-architecture/software-architecture/hexagonal-architecture
HEXAGONAL_FE   = courses/codely/software-design-and-architecture/software-architecture/hexagonal-architecture-frontend
FE_TESTING     = courses/codely/software-design-and-architecture/software-architecture/frontend-testing
DDD            = courses/codely/software-design-and-architecture/domain-driven-design
```

`courses/…` and `company/…` paths are relative to the knowledge base root. `CC_RULES`, `API_RULES`, and `VERCEL_RULES` are relative to this skill's directory — they assume the companion leaf skills (`clean-code-best-practices`, `rest-api-best-practices`, `vercel-react-best-practices`) are installed as siblings. Install them alongside `reviewer` or the rule lookups will no-op.

---

## Domain Modeling

When reviewing entities, value objects, aggregates, or domain invariants.

| Source | Key Concepts |
|--------|-------------|
| `CC_RULES/domain-value-objects.md` | Extract primitives into VOs with validation + behavior |
| `CC_RULES/domain-encapsulation.md` | Tell-Don't-Ask, restrict setters, push logic into objects |
| `CC_RULES/domain-named-constructors.md` | Factory methods for lifecycle (create, fromPrimitives) |
| `CC_RULES/domain-immutability.md` | Readonly properties, return new instances |
| `CC_RULES/domain-typed-collections.md` | Replace arrays with typed collection classes |
| `CC_RULES/domain-contextual-naming.md` | Prefix VOs with aggregate context |
| `CC_RULES/domain-optional-values.md` | Maybe/Optional monad, avoid null |
| `CLEAN_CODE/objects-vs-data-structures-and-encapsulation.md` | Objects vs data structures, Tell-Don't-Ask, Factory Method, DateRange extraction, magnet effect, encapsulation, DTOs |
| `CLEAN_CODE/avoiding-boolean-arguments-and-default-values.md` | Funnel anti-pattern, specialized methods, preventing invalid states, API surface reduction |
| `OOP_PRACTICES/oop-four-pillars-and-object-definition.md` | Four pillars, cohesion, DI, objects vs classes |
| `OOP_PRACTICES/factory-methods-and-domain-model-anatomy.md` | Named constructors, VOs, immutability, toPrimitive |
| `OOP_PRACTICES/law-of-demeter-and-tell-dont-ask.md` | LoD, Tell-Don't-Ask, getter avoidance |
| `SOLID_PRINCIPLES/single-responsibility-principle.md` | SRP for domain models vs services, "and" test, cohesion |
| `VALUE_OBJECTS/value-objects-before-after-benefits.md` | Anemic domain prevention, API simplification via set restriction, constructor receives primitives, getter returns primitives, VO as logic magnet |
| `VALUE_OBJECTS/refactoring-and-modeling-domain-logic.md` | Contextual naming (UserEmail not Email), parallel change, LoD delegation, method explosion → vertical slicing, VO collections, complex hierarchies |
| `VALUE_OBJECTS/instantiation-debate-and-constructor-patterns.md` | Aggregate-internal instantiation, private constructors, lifecycle factory methods, fromPrimitives for ORM, domain events |
| `VALUE_OBJECTS/optional-values-errors-and-defaults.md` | Maybe/Optional monad, Null Object (discouraged), custom exceptions with typed properties, Either monad, default parameter anti-pattern, factory method API restriction |

## Aggregates

When reviewing aggregate roots, aggregate growth, splitting decisions, domain events, or bounded context boundaries.

| Lesson | Key Concepts |
|--------|-------------|
| `AGGREGATES/aggregates-and-their-challenges.md` | Aggregate root, horizontal/vertical growth, splitting, N+1, relationship by identifier |
| `AGGREGATES/orchestration-and-bounded-contexts.md` | API Gateway/BFF, controller orchestration, bounded contexts, SQL views as projections |
| `AGGREGATES/uuids-integrity-and-validation.md` | Client-side UUID generation, validation placement, integrity constraints, ProductFinder |
| `AGGREGATES/polymorphism-and-data-migration.md` | Inheritance mapping (join/single/separate tables), progressive migration, schema evolution |
| `AGGREGATES/primitives-pattern.md` | toPrimitives/fromPrimitives, TypeScript utility types, getter elimination, encapsulation |
| `AGGREGATES/conventions-and-vo-entity-modeling.md` | Module promotion to bounded context, VO↔Entity transitions, materialized fields, JSON columns |
| `AGGREGATES/performance-and-criteria-pattern.md` | Percentile metrics (p99 vs mean), materialized fields, Criteria/Specification pattern, cursor pagination |
| `AGGREGATES/domain-events-and-aggregate-testing.md` | Domain events via factory methods, custom matcher (AggregateRootSimilarComparator), Object Mother testing gap |
| `AGGREGATES/non-uuid-identifiers.md` | Sequential IDs, dual identifier strategy, NanoID, self-healing URLs, idempotency guards |
| `AGGREGATES/accelerating-aggregate-design-with-ai.md` | Aggregate Design Canvas, codeless aggregate design, AI scaffolding prompts |

## Strategic DDD

When the user needs to define bounded contexts, decide on shared kernel boundaries, plan module promotion, choose between hexagonal and CQRS, design cross-module communication, plan legacy migration, or apply outside-in development workflow.

| Lesson | Key Concepts |
|--------|-------------|
| `DDD/ddd-overview-and-concepts.md` | Strategic vs tactical DDD, context maps, anti-corruption layers, shared kernel, open host service, customer-supplier, conformist, why skipping strategic DDD causes god aggregates |
| `DDD/hexagonal-architecture-and-user-registration.md` | Complete student registration use case from acceptance test to in-memory repository, VO instantiation, CQS, domain exceptions as semantic modeling |
| `DDD/repository-refactoring-and-dependency-inversion.md` | Repository extraction, role interfaces vs hidden interfaces, dependency inversion, communication strategies (repository injection vs domain service injection) |
| `DDD/defining-bounded-contexts-and-modular-architecture.md` | Module vs bounded context vs microservice comparison matrix (7 dimensions), two-level shared kernel, monorepo structure, team autonomy, infrastructure isolation |
| `DDD/decoupling-modules-with-domain-events.md` | Aggregate root event recording, event bus as hexagonal port, sync vs async dispatch, pull semantics, SRP/OCP violations driving event extraction |
| `DDD/sharing-code-between-bounded-contexts.md` | Code sharing decision framework, premature abstraction risks, safe sharing (ID types, event contracts) vs risky sharing (behavior-heavy VOs, validators), infrastructure definition vs instance sharing, promotion rules |
| `DDD/legacy-migration-with-domain-events.md` | Repository interface as containment barrier, incremental extraction via domain events, event JSON structure, subscriber as controller equivalent, two migration strategies |
| `DDD/event-driven-cross-module-data-materialization.md` | Write-time materialization vs read-time querying, full recalculation for idempotency, occurred_on for out-of-order events, subscriber-as-controller pattern, inheritance for structural sharing, discriminator maps |
| `DDD/hexagonal-architecture-vs-cqrs.md` | Pure hexagonal vs CQRS progression, command/query bus pattern, VO instantiation delegation, inter-module communication via query bus, three evolutionary stages |
| `DDD/data-denormalization-and-api-aggregation-strategies.md` | Four API aggregation strategies (parallel client requests, API Gateway/BFF, event-driven projections, controller-level composition), CQRS-style REST endpoints, search engine + JSON column architecture |
| `DDD/promoting-modules-to-bounded-contexts.md` | Organizational-driven promotion triggers, client code transparency via buses, infrastructure duplication, namespace refactoring, architecture must tolerate promotion without redesign |
| `DDD/monorepos-vs-multirepos-practical-implementation.md` | Monorepo with strict decoupling, PHP Composer/Symfony bundles, Java Gradle multi-project, Scala SBT, intentional framework convention overrides for screaming architecture |
| `DDD/outside-in-development-and-ubiquitous-language.md` | Contract-first API definition, parallel frontend/backend development, ubiquitous language permeation across all hexagonal layers, technology deferral, infrastructure leaks detectable from naming |
| `DDD/ddd-faq-adoption-async-and-aggregates.md` | Pain-driven team adoption, async communication trade-offs (optimistic updates, polling, WebSockets), aggregate design rules (one mutation per request, no lazy loading across boundaries), framework integration boundaries, distributed transactions as compensating operations |
| `DDD/ddd-faq-event-handling-bounded-contexts-and-validation.md` | Tell Don't Ask + DDD tension resolved via bounded contexts, 1:1 ideal (one app per context), microservices = contexts not modules, dual-purpose validation (controller UX vs VO domain integrity), shared validator coupling risks |

## Domain Events

When reviewing event-driven implementations, publishing strategies, event bus wiring, subscriber patterns, event naming, or legacy event refactoring.

| Lesson | Key Concepts |
|--------|-------------|
| `DOMAIN_EVENTS/introduction-to-domain-events.md` | SOLID unlocking via SRP+OCP, message broker architecture, event characteristics (DTO, JSON, immutable, past-tense naming), infrastructure progression, common problems (versioning, sagas, at-least-once, unordered consumption) |
| `DOMAIN_EVENTS/domain-event-publishing-strategies.md` | Four publishing strategies: (1) app service EventBus, (2) constructor static EventBus (anti-pattern), (3) aggregate root record+pull (recommended), (4) curried factory methods. Trade-offs: cohesion, coupling, testability |
| `DOMAIN_EVENTS/event-granularity-and-semantics.md` | Coarse vs fine-grained events, CRUD-like vs semantic naming, wildcard routing, state machine modeling, subscriber-side translation |
| `DOMAIN_EVENTS/event-naming-and-versioning.md` | Structured naming (vendor.message_type.context.aggregate.action.version), parallel publishing, sunset phases, AsyncAPI |
| `DOMAIN_EVENTS/internal-external-events-and-enrichment.md` | Internal vs external classification, five publishing/enrichment scenarios, progressive strategy by team size |
| `DOMAIN_EVENTS/derived-use-cases-and-event-subscribers.md` | ActionOnEvent naming, subscriber/use-case separation, testing with subscriber as entry point, persistence-as-derived-action anti-pattern |
| `DOMAIN_EVENTS/refactoring-legacy-systems-with-domain-events.md` | Three incremental legacy strategies, testing per scenario, pragmatic legacy strategy |
| `DOMAIN_EVENTS/change-data-capture-for-legacy-events.md` | CDC via triggers, mutations table, transformers, last-resort for uncontrollable entry points |
| `DOMAIN_EVENTS/event-bus-implementation-and-di-integration.md` | InMemoryEventBus, DI integration (TypeScript/PHP/Java), OCP for subscriber registration |

## Projections

When reviewing data access strategies, read model design, cross-context data resolution, or join avoidance patterns.

| Lesson | Key Concepts |
|--------|-------------|
| `PROJECTIONS/projections-overview.md` | Four strategies (repository ACL, DB views, materialized views, app-level projections), projection flow via event bus, bounded context separation |
| `PROJECTIONS/decision-criteria-for-data-modeling.md` | Eight-criteria comparison, Postgres refresh strategies, distributed DB support as differentiator |
| `PROJECTIONS/implementing-user-retention-projections.md` | Idempotent projection creation, scalar modeling, subscriber-as-entry-point testing |
| `PROJECTIONS/modeling-likes-and-projections.md` | Separate aggregate for counters, event deduplication, eventual consistency handling, write-time computation |
| `PROJECTIONS/resolving-cross-context-data-in-projections.md` | Three cross-context approaches (event enrichment, neighbor fetch, local projection), typed collections with immutability |

## Repositories

When reviewing repository contracts, persistence adapters, infrastructure leaks, or transaction management.

| Lesson | Key Concepts |
|--------|-------------|
| `REPOSITORIES/repository-pattern-introduction.md` | Repository as domain contract, adapter pattern, search vs find, VO signatures, DI |
| `REPOSITORIES/infrastructure-leaks-and-structural-coupling.md` | Structural coupling, flush leak (Unit of Work), header vs role interfaces, naming conventions |
| `REPOSITORIES/repository-testing-strategies.md` | Mock/spy approach, integration tests vs real DB, UserFinder service, domain exception testing |
| `REPOSITORIES/repository-without-interfaces-and-functional-approach.md` | JS without interfaces (Jest mocking), FP alternative with typed lambdas, currying as DI |
| `REPOSITORIES/caching-criteria-and-transactions.md` | Decorator caching, Criteria pattern for method explosion, transaction management, eventual consistency |
| `REPOSITORIES/payment-providers-dao-and-repository-error-handling.md` | DAO vs Repository, exception mapping, Either as domain contract, payment integration |
| `REPOSITORIES/repository-full-entities-and-gateway-pattern.md` | Full entities as default, partial entity risks, reporting repositories, Gateway pattern (Fowler) |
| `REPOSITORIES/orm-mapping-collaborators-and-cqrs.md` | ORM mapping strategies (entity class vs XML), collaborator distinction, CQRS misconceptions (not read/write verb split) |

## Service Layer & Use Cases

When reviewing application services, use cases, or business logic orchestration.

| Lesson | Key Concepts |
|--------|-------------|
| `CLEAN_CODE/srp-refactoring-and-naming-conventions.md` | SRP, extracting use case classes, agent noun naming, implementation naming (avoid "Impl") |
| `CLEAN_CODE/abstract-classes-service-extraction-and-coupling-tradeoffs.md` | Service extraction triggers, coupling trade-offs (whole object vs scalar), typed collections |
| `OOP_PRACTICES/modular-architecture-and-inter-module-communication.md` | Screaming architecture, module boundaries, inter-module DTOs |
| `SOLID_PRINCIPLES/srp-applied-to-crud.md` | When to split CRUD, encapsulating persistence, single-use-case services |
| `CHANGE_PREVENTERS/understanding-srp-revisited.md` | SRP via Dijkstra's "aspects", vectors of change for service decomposition |

## Type Hierarchies & Polymorphism

When reviewing switch statements, type checks, or conditional-to-polymorphism refactorings.

| Lesson | Key Concepts |
|--------|-------------|
| `CLEAN_CODE/abstract-classes-service-extraction-and-coupling-tradeoffs.md` | Abstract class hierarchies, typed collections, Principle of Least Surprise |
| `OOP_PRACTICES/inheritance-vs-composition.md` | Composition, collaborators, aggregate-root, template-method, traits |
| `OOP_PRACTICES/interfaces-vs-abstract-classes.md` | Decision tree, accidental complexity, contracts |
| `SOLID_PRINCIPLES/open-closed-principle.md` | OCP via interfaces/abstract classes, template method, domain events |
| `SOLID_PRINCIPLES/gilded-rose-kata-refactoring.md` | Switch-to-polymorphism refactoring, 3-phase SOLID workflow |
| `CHANGE_PREVENTERS/parallel-inheritance-hierarchies-refactoring.md` | Legitimate vs smell parallel hierarchies (separate aggregates vs 1:1 satellite), move method/field, abstract method compiler enforcement, IDE limitations |

## Coupling & Dependency Management

When reviewing coupling between modules, dependency direction, or ports-and-adapters adherence.

| Source | Key Concepts |
|--------|-------------|
| `CC_RULES/deps-inversion.md` | Depend on abstractions, domain never imports infrastructure |
| `CC_RULES/deps-injection-vs-inversion.md` | DI + interface = true DIP |
| `CC_RULES/deps-interface-segregation.md` | Role interfaces shaped by client needs |
| `CC_RULES/deps-composition-over-inheritance.md` | Inject collaborators, final classes by default |
| `CC_RULES/deps-ports-and-adapters.md` | Domain defines ports, infrastructure provides adapters |
| `OOP_PRACTICES/coupling-types-strong-weak-structural.md` | Strong/weak/structural coupling, ports-and-adapters |
| `SOLID_PRINCIPLES/dependency-inversion-principle.md` | DIP 4-stage progression, import check heuristic, domain never imports infrastructure |
| `SOLID_PRINCIPLES/interface-segregation-principle.md` | ISP role vs header interfaces, structural coupling reduction |
| `SOLID_PRINCIPLES/composition-over-inheritance.md` | Inject collaborators over inheriting behavior, final classes, indirection cost |
| `CHANGE_PREVENTERS/shotgun-surgery-common-design-errors.md` | Seven design errors: multi-repo default, coupling to implementations, integration test mocking, hardcoded CSS, fragile selectors, missing Page Object, duplicated components |

## Hexagonal Architecture (Backend)

When reviewing hexagonal architecture compliance, layer boundaries, infrastructure services, or domain/application service distinction.

| Lesson | Key Concepts |
|--------|-------------|
| `HEXAGONAL/introduction-and-benefits.md` | Four benefits (maintainability, changeability, testing, simplicity), macro vs micro design, accidental vs essential complexity |
| `HEXAGONAL/hexagonal-layers-and-dependency-rule.md` | Three layers (infrastructure, application, domain), dependency rule, Active Record comparison, testing strategy per layer |
| `HEXAGONAL/infrastructure-services-and-notification-patterns.md` | Infrastructure services beyond repos, structural coupling in interfaces, constructor exclusion, fake implementations, DI container swapping |
| `HEXAGONAL/domain-vs-application-services.md` | Domain service = reusable business logic, application service = transactional boundary, interface-overuse anti-pattern, why not to mock domain services |
| `HEXAGONAL/domain-modeling-value-objects-and-events.md` | VOs in hexagonal context, Named Constructors, event registration vs publishing, rich vs anemic models |
| `HEXAGONAL/unit-testing-application-services.md` | Mocking infrastructure ports, Object Mother, command handler vs direct invocation |
| `HEXAGONAL/integration-testing-infrastructure.md` | Repository tests with real implementations, ORM identity map pitfalls, external service testing |
| `HEXAGONAL/qa-best-practices.md` | Dual validation, UUID wrapper, two-layer simplification, Docker fixtures, domain service injection |

## SOLID Principles

When reviewing for SOLID violations, STUPID anti-patterns, or dependency direction issues.

| Lesson | Key Concepts |
|--------|-------------|
| `SOLID_PRINCIPLES/introduction-to-solid-and-stupid-principles.md` | STUPID anti-patterns (Singleton, Tight Coupling, Untestability, Premature Optimization, Indescriptive Naming, Duplication), SOLID overview |
| `SOLID_PRINCIPLES/single-responsibility-principle.md` | SRP "and" test, domain models vs services, cohesion litmus test |
| `SOLID_PRINCIPLES/open-closed-principle.md` | OCP via interfaces/abstract classes, template method, domain events |
| `SOLID_PRINCIPLES/liskov-substitution-principle.md` | LSP contract compliance, subtypes honor parent contracts, unit-of-work caveats |
| `SOLID_PRINCIPLES/interface-segregation-principle.md` | ISP role vs header interfaces, structural coupling, client-shaped interfaces |
| `SOLID_PRINCIPLES/dependency-inversion-principle.md` | DIP 4-stage progression, import check heuristic, domain never imports infrastructure |
| `SOLID_PRINCIPLES/gilded-rose-kata-refactoring.md` | 3-phase SOLID refactoring workflow, switch-to-polymorphism |
| `SOLID_PRINCIPLES/composition-over-inheritance.md` | BaseController anti-pattern, final classes, inject collaborators, indirection cost |
| `SOLID_PRINCIPLES/criteria-pattern.md` | Specification pattern, repository interface collapse, searchByCriteria |
| `SOLID_PRINCIPLES/srp-applied-to-crud.md` | When to split CRUD, encapsulating persistence, single-use-case services |
| `SOLID_PRINCIPLES/solid-principles-vs-functional-programming.md` | SOLID-to-FP mapping, function signatures as contracts, higher-order functions as DIP |
| `CHANGE_PREVENTERS/understanding-srp-revisited.md` | SRP via Dijkstra's "aspects", vectors of change, composition over inheritance for multi-axis evolution |

## Programming Paradigms

When reviewing code that uses or should use alternative paradigms, typing strategies, or cross-cutting concerns.

| Lesson | Key Concepts |
|--------|-------------|
| `OOP_PRACTICES/programming-paradigms-aop-actors-functional.md` | AOP, actors, FP, higher-order functions |
| `OOP_PRACTICES/typing-paradigms-duck-structural-nominal.md` | Duck/structural/nominal typing |
| `SOLID_PRINCIPLES/solid-principles-vs-functional-programming.md` | SOLID-to-FP mapping, function signatures as contracts |
| `CHANGE_PREVENTERS/oo-to-functional-refactoring-csv-importer.md` | OO-to-functional transition, pure function composition, LINQ Select as map, extension methods, pipe operator, cross-language OO-functional convergence |

## Component Architecture (Frontend)

When reviewing UI component decomposition, boundaries, or component trees.

| Source | Key Concepts |
|--------|-------------|
| `VERCEL_RULES/rerender-memo.md` | Extract expensive work into memoized child components |
| `VERCEL_RULES/rendering-hoist-jsx.md` | Hoist static JSX outside components |
| `VERCEL_RULES/rendering-conditional-render.md` | Use ternary not && for conditional rendering |
| `CLEAN_CODE/srp-refactoring-and-naming-conventions.md` | SRP for components, naming conventions |
| `CLEAN_CODE/clean-code-practices-in-user-controller-design.md` | Boolean naming (is/has/can), guard clauses |
| `OOP_PRACTICES/modular-architecture-and-inter-module-communication.md` | Screaming architecture for features, cohesion |
| `OOP_PRACTICES/oop-four-pillars-and-object-definition.md` | Encapsulation for component APIs, cohesion |

## Hexagonal Architecture (Frontend)

When reviewing hexagonal architecture in frontend projects, vertical slicing, repository patterns, functional DI, or legacy migration approaches.

| Source | Key Concepts |
|--------|-------------|
| `HEXAGONAL_FE/hexagonal-vertical-slicing-and-frontend-adaptation.md` | Vertical slicing (feature-first), screaming architecture, component-as-application compromise, bounded contexts in frontend |
| `HEXAGONAL_FE/hexagonal-frontend-course-app-repository-validation.md` | Repository pattern with localStorage, functional DI (parameter passing), client-side ID generation, dual validation (domain + UX), ensure functions |
| `HEXAGONAL_FE/hexagonal-frontend-testing-strategies.md` | Unit/integration/acceptance mapped to hexagonal layers, mock at repository interface, Testing Library consistency |
| `HEXAGONAL_FE/promises-object-mother-and-shared-module.md` | Promises in repository interfaces, Object Mother with Faker/Fishery, shared module governance (rule of three) |
| `HEXAGONAL_FE/functional-vs-oop-and-value-files.md` | Use cases as functions (not classes), repository decomposition, currying for DI, value files as functional VOs |
| `HEXAGONAL_FE/map-feature-type-decoupling-and-layer-rules.md` | Domain vs external API types, pure-computation use cases, golden rules for layer imports |
| `HEXAGONAL_FE/migrating-jquery-to-hexagonal-and-trade-offs.md` | Incremental jQuery migration, Cypress safety net, hexagonal vs well-structured trade-offs, ESLint CI enforcement |

## Data Fetching & Server Components (Frontend)

When reviewing data fetching strategy, server/client boundaries, or streaming patterns.

| Source | Key Concepts |
|--------|-------------|
| `VERCEL_RULES/async-parallel.md` | Use Promise.all() for independent operations |
| `VERCEL_RULES/async-suspense-boundaries.md` | Use Suspense to stream content progressively |
| `VERCEL_RULES/server-serialization.md` | Minimize data passed to client components |
| `VERCEL_RULES/server-parallel-fetching.md` | Restructure components to parallelize fetches |
| `VERCEL_RULES/server-cache-react.md` | React.cache() for per-request deduplication |

## State Management (Frontend)

When reviewing state ownership, derived state, or synchronization patterns.

| Source | Key Concepts |
|--------|-------------|
| `VERCEL_RULES/rerender-derived-state.md` | Subscribe to derived booleans, not raw values |
| `VERCEL_RULES/rerender-derived-state-no-effect.md` | Derive state during render, not in effects |
| `VERCEL_RULES/rerender-functional-setstate.md` | Functional setState for stable callbacks |
| `CLEAN_CODE/objects-vs-data-structures-and-encapsulation.md` | Encapsulation, Tell-Don't-Ask, data ownership |
| `OOP_PRACTICES/law-of-demeter-and-tell-dont-ask.md` | Tell-Don't-Ask for store/hook interfaces |
| `OOP_PRACTICES/factory-methods-and-domain-model-anatomy.md` | Immutability for state, value objects |

## Performance (Frontend)

When reviewing bundle size, re-renders, or rendering performance.

| Source | Key Concepts |
|--------|-------------|
| `VERCEL_RULES/bundle-barrel-imports.md` | Import directly, avoid barrel files |
| `VERCEL_RULES/bundle-dynamic-imports.md` | Use next/dynamic for heavy components |
| `VERCEL_RULES/rerender-memo.md` | Extract expensive work into memoized components |
| `VERCEL_RULES/rendering-conditional-render.md` | Ternary, not && for conditionals |

## Frontend Testing (Testing Library)

When reviewing frontend test quality, Testing Library usage, accessibility testing, or test boundary decisions.

| Source | Key Concepts |
|--------|-------------|
| `FE_TESTING/introduction-to-testing-library.md` | Testing Library philosophy, getByRole/getByLabelText queries, User Event vs fireEvent, shallow mount pitfalls, snapshot testing problems |
| `FE_TESTING/cross-framework-testing-library.md` | React/Angular/Vue comparison, Angular getByRole limitations, i18n strategies (translation keys vs regex) |
| `FE_TESTING/improving-test-readability-with-testing-library.md` | Page Object with Testing Library, jest-dom assertions, Vue UserEvent async gotcha (waitFor) |
| `FE_TESTING/accessibility-benefits-and-query-selection.md` | AXE (jest-axe) validation, ARIA attributes, query selection pyramid, accessible names |
| `FE_TESTING/frontend-testing-strategies-and-boundaries.md` | Use case as test unit, mock at repository boundary, testing pyramid/trophy convergence |
| `FE_TESTING/mocking-strategies-jest-and-msw.md` | Three mocking approaches (fetch spy, MSW, repository mock), decision matrix, Jest mock lifecycle (clear/reset/restore), when not to mock encapsulated libraries |
| `FE_TESTING/test-structure-and-arrange-act-assert.md` | Arrange-Act-Assert for React tests, test independence over DRY, Jest describe/it hierarchy, shared setup anti-pattern |
| `FE_TESTING/global-store-test-factories-and-snapshots.md` | Real store over mocked store (Vuex/Redux), custom render with plugin injection, Test Object Factories (Fishery/Faker), snapshot testing trade-offs |
| `FE_TESTING/testing-strategies-qa-and-best-practices.md` | Acceptance vs E2E equivalence, ATDD+TDD dual cycle, testing vanilla JS across modularity scenarios, third-party UI library testing cost-benefit |
| `FE_TESTING/common-testing-errors-and-best-practices.md` | Five common Testing Library mistakes: container queries, wrong query variant (getBy/queryBy/findBy), sleep instead of async utilities, side effects in waitFor, shared beforeEach hiding context |
| `FE_TESTING/implementing-ci-with-github-actions.md` | GitHub Actions YAML workflow, dependency caching, required status checks, merge strategy implications |

## Refactoring

When reviewing refactoring work or code restructuring.

| Source | Key Concepts |
|--------|-------------|
| `CC_RULES/bloater-primitive-obsession.md` | Replace primitives with value objects |
| `CC_RULES/bloater-long-method.md` | Extract semantic methods |
| `CC_RULES/bloater-long-parameter-list.md` | Introduce parameter objects |
| `CC_RULES/bloater-large-class.md` | Decompose via composition |
| `CC_RULES/bloater-complex-conditionals.md` | Guard clauses, decompose boolean expressions |
| `CC_RULES/bloater-boolean-parameters.md` | Specialized methods instead of flags |
| `CLEAN_CODE/refactoring-strategies-and-technical-debt.md` | Scout Rule, preparatory refactoring (test → refactor → implement), premature abstraction, ADRs |
| `CLEAN_CODE/introduction-to-clean-code-and-refactoring-practices.md` | Clean Code principles, naming, function size, abstraction levels |
| `SOLID_PRINCIPLES/gilded-rose-kata-refactoring.md` | 3-phase SOLID refactoring workflow, characterization tests → extract → polymorphism |
| `VALUE_OBJECTS/refactoring-and-modeling-domain-logic.md` | Parallel change for VO adoption, contextual naming, vertical slicing for method explosion |
| `CHANGE_PREVENTERS/split-phase-refactoring-mixed-responsibilities.md` | Split phase, sandwich refactoring, interleaved responsibilities, CSV parsing separation, repository pattern extraction |
| `CHANGE_PREVENTERS/split-phase-hands-on-refactoring-process.md` | CPDD (copy-paste driven development), baby steps, extract method, parallel change, backward compatibility, pair programming |

## Code Smells: Change Preventers

When reviewing for change preventer code smells — shotgun surgery, divergent change, split phase violations, or parallel inheritance hierarchies.

| Source | Key Concepts |
|--------|-------------|
| `CC_RULES/change-shotgun-surgery.md` | Centralize scattered values in domain objects |
| `CC_RULES/change-divergent-change.md` | Separate by vector of change |
| `CC_RULES/change-split-phase.md` | Split mixed responsibilities into sequential phases |
| `CC_RULES/change-parallel-inheritance.md` | Absorb 1:1 satellite hierarchies into aggregate |
| `CHANGE_PREVENTERS/split-phase-refactoring-mixed-responsibilities.md` | Split phase, sandwich refactoring, interleaved responsibilities, CSV parsing separation, repository pattern extraction |
| `CHANGE_PREVENTERS/split-phase-hands-on-refactoring-process.md` | CPDD (copy-paste driven development), baby steps, extract method, parallel change, backward compatibility, pair programming |
| `CHANGE_PREVENTERS/understanding-srp-revisited.md` | SRP via Dijkstra's "aspects", vectors of change, composition over inheritance for multi-axis evolution, repository cohesion (bounded context > read/write split), CQRS justification |
| `CHANGE_PREVENTERS/shotgun-surgery-hands-on-refactoring.md` | Intra-class shotgun surgery (extract constant → extract method), cross-class shotgun surgery (CPDD to domain model), Object Mother for test decoupling |
| `CHANGE_PREVENTERS/shotgun-surgery-common-design-errors.md` | Seven design errors: multi-repo default, coupling to implementations, integration test mocking, hardcoded CSS, fragile selectors, missing Page Object, duplicated components |
| `CHANGE_PREVENTERS/divergent-change-and-shotgun-surgery.md` | Tension between divergent change and shotgun surgery, fat controllers, monolithic entities, centralized config, Active Record trade-off, bounded context as primary hierarchy, rename-to-Utils refactoring trick |
| `CHANGE_PREVENTERS/parallel-inheritance-hierarchies-refactoring.md` | Legitimate vs smell parallel hierarchies (separate aggregates vs 1:1 satellite), move method/field, abstract method compiler enforcement, IDE limitations |
| `CHANGE_PREVENTERS/change-preventers-qa-scalability-and-design.md` | Scaling split-phase controllers (caching, materialized views, event-driven parsing), Liskov violation in partial repositories, class extraction vs simple design |
| `CHANGE_PREVENTERS/oo-to-functional-refactoring-csv-importer.md` | OO-to-functional transition, pure function composition, LINQ Select as map, extension methods, pipe operator, cross-language OO-functional convergence |

## Code Quality & Conventions

When reviewing naming, formatting, linting, or code style.

| Source | Key Concepts |
|--------|-------------|
| `CC_RULES/method-guard-clauses.md` | Early returns for validation |
| `CC_RULES/method-boolean-naming.md` | Prefix with is/has/can/should |
| `CC_RULES/naming-reveal-intention.md` | Names reveal purpose without reading implementation |
| `CC_RULES/naming-avoid-impl-suffix.md` | Name by what makes implementation different |
| `CC_RULES/naming-search-vs-find.md` | search returns nullable, find throws |
| `CC_RULES/naming-context-aware.md` | Remove redundant context |
| `CLEAN_CODE/clean-code-practices-in-user-controller-design.md` | Boolean naming (is/has/can), guard clauses, method extraction, context-aware naming |
| `CLEAN_CODE/code-formatting-and-linting-conventions.md` | Vertical spacing, method ordering, variable declaration near use |

## Simple Design & YAGNI

When reviewing for over-engineering, premature abstractions, unnecessary elements, or incorrect duplication handling.

| Source | Key Concepts |
|--------|-------------|
| `CC_RULES/simple-rule-of-three.md` | Wait for 3 instances before abstracting |
| `CC_RULES/simple-yagni.md` | Only add structure when needed |
| `CC_RULES/simple-minimize-elements.md` | Remove until it hurts |
| `CC_RULES/simple-duplication-types.md` | Distinguish literal, structural, conceptual duplication |
| `FOUR_RULES/four-rules-overview.md` | Kent Beck's four rules, reveal intention, minimize elements, factory methods vs builder pattern, private methods vs injected collaborators |
| `FOUR_RULES/yagni-and-premature-abstractions.md` | YAGNI anti-patterns, premature interfaces, justified interfaces (I/O test doubles, programmatic introspection), justified exception (timestamps) |
| `FOUR_RULES/code-duplication-types-and-strategies.md` | Three duplication types (literal, structural, conceptual), DRY within scope, WET/Rule of Three, shotgun surgery, snapshots, SSOT exception in tests |
| `FOUR_RULES/fragile-tests-and-bug-reproduction.md` | Fragile spy-based tests vs robust behavior tests, bug reproduction workflow, refactor resilience |

## Testing Strategy

When reviewing test quality, coverage, or test architecture.

| Lesson | Key Concepts |
|--------|-------------|
| `TESTING/unit-testing-and-test-pyramid.md` | Test pyramid, unit = use case (not class), hexagonal layers |
| `TESTING/test-doubles-and-maintainable-tests.md` | Doubles taxonomy (dummy, fake, stub, mock), Object Mother, builder pattern |
| `TESTING/dummy-and-spy-test-doubles.md` | Manual dummies, spies, spy vs mock differences |
| `TESTING/test-structure-srp-and-given-when-then.md` | Folder structure, SRP in tests, Given-When-Then |
| `TESTING/semantic-testing-and-given-when-then-methods.md` | Named GWT methods, explicit setup over implicit setUp() |
| `TESTING/flaky-tests-and-time-dependent-testing.md` | Clock injection, test randomization, environmental state extraction |
| `VALUE_OBJECTS/testing-with-object-mothers.md` | One Mother per VO, partial params + Faker, Mothers extract .value, Faker anti-corruption layer, flaky tests as discovery |

## API Design & Contracts

When reviewing endpoints, request/response shapes, exception semantics, or REST API conventions.

| Source | Key Concepts |
|--------|-------------|
| `API_RULES/url-kebab-case.md` | kebab-case for path segments |
| `API_RULES/url-resource-oriented.md` | Verb-free, noun-based resource URLs |
| `API_RULES/url-pluralized-nouns.md` | Plural nouns for collections |
| `API_RULES/http-method-semantics.md` | Method semantics (safe, idempotent, cacheable) |
| `API_RULES/http-422-validation.md` | 422 for validation, 400 for malformed |
| `API_RULES/http-idempotency.md` | Idempotent operations with secondary keys |
| `API_RULES/error-problem-json.md` | RFC 7807 Problem JSON for errors |
| `API_RULES/page-cursor-based.md` | Cursor-based pagination over offset |
| `API_RULES/json-snake-case.md` | snake_case for JSON properties |
| `API_RULES/compat-never-break-clients.md` | Backward compatibility is highest priority |
| `API_RULES/compat-compatible-extensions.md` | Only additive changes |
| `TESTING/atdd-practical-example-with-tdd.md` | ATDD as API contract, search vs find exception semantics |
| `TESTING/acceptance-testing-practices-and-gherkin-semantics.md` | Acceptance verification strategies, error case coverage |
| `ZALANDO_API/api-design-principles-and-meta-information.md` | API First, OpenAPI, semantic versioning, security, data formats |
| `ZALANDO_API/url-design-and-resource-naming.md` | Resource-oriented URLs, kebab-case paths, snake_case query params, pluralization, nesting limits |
| `ZALANDO_API/json-payload-conventions.md` | snake_case properties, UPPER_SNAKE_CASE enums, null semantics, common fields, money/address objects |
| `ZALANDO_API/http-methods-and-status-codes.md` | Method semantics, 422 for validation (not 400), Problem JSON (RFC 7807), rate limiting, idempotency |
| `ZALANDO_API/headers-performance-and-pagination.md` | Cursor-based pagination, field filtering, sub-resource embedding, REST maturity L2 |
| `ZALANDO_API/compatibility-versioning-and-deprecation.md` | Backward compatibility, compatible extensions, media-type versioning, deprecation lifecycle |

## Feedback Delivery

When framing review findings — how to communicate issues constructively.

| Lesson | Key Concepts |
|--------|-------------|
| `FEEDBACK/how-to-give-and-receive-feedback/effective-objective-feedback-techniques.md` | Observations vs judgments, relative language, expressing feelings |
| `FEEDBACK/giving-and-receiving-feedback/common-feedback-mistakes-and-alternatives.md` | No feedback sandwich, growth mindset, avoid fixed-trait labels |
| `FEEDBACK/giving-and-receiving-feedback/effective-feedback-strategies-and-challenges.md` | Specific feedback, avoid ambiguity, constructive delivery |

---

## Quick Selection Guide

Use this to rapidly pick lessons based on the code being reviewed:

- **Backend service review**: Domain Modeling + Service Layer + SOLID Principles + Coupling & Dependency Management + Domain Events + Projections + Code Quality + Testing Strategy
- **Frontend component review**: Component Architecture + Data Fetching + State Management + Performance
- **Test suite review**: Testing Strategy (all lessons) + Code Quality
- **Refactoring review**: Refactoring + Testing Strategy + relevant domain section
- **OOP violations review**: Domain Modeling + SOLID Principles + Coupling & Dependency Management + Type Hierarchies
- **Full-stack feature review**: Domain Modeling + Component Architecture + Coupling & Dependency Management + Testing Strategy + Code Quality
- **API endpoint review**: API Design + Service Layer + Testing Strategy
- **YAGNI / over-engineering review**: Simple Design & YAGNI + Code Quality + Refactoring
- **Duplication review**: Simple Design & YAGNI + Code Quality
- **Fragile test review**: Simple Design & YAGNI + Testing Strategy
- **SOLID violations review**: SOLID Principles + Domain Modeling + Coupling & Dependency Management + Service Layer
- **Composition vs inheritance review**: SOLID Principles + Type Hierarchies + Domain Modeling
- **Value object design review**: Domain Modeling + Refactoring + Testing Strategy
- **Constructor patterns / instantiation review**: Domain Modeling + Testing Strategy
- **Error handling / optional values review**: Domain Modeling + Testing Strategy
- **Object Mother deep dive**: Testing Strategy + Domain Modeling
- **REST API design (greenfield)**: API Design & Contracts (all lessons)
- **REST API endpoint (single)**: API Design (`url-design-and-resource-naming` + `http-methods-and-status-codes` + `json-payload-conventions`)
- **API compatibility / versioning**: API Design (`compatibility-versioning-and-deprecation`)
- **Pagination design/review**: API Design (`headers-performance-and-pagination`)
- **Error response format**: API Design (`http-methods-and-status-codes`)
- **Change preventer review**: Code Smells: Change Preventers + Refactoring + Coupling & Dependency Management
- **Shotgun surgery review**: Code Smells: Change Preventers (`shotgun-surgery-*` + `divergent-change-*`)
- **False smell assessment**: Code Smells: Change Preventers (`shotgun-surgery-common-design-errors` — false smells section)
- **Aggregate design**: Aggregates + Domain Modeling + Testing Strategy
- **Aggregate growth / splitting**: Aggregates (`aggregates-and-their-challenges` + `orchestration-and-bounded-contexts`)
- **Bounded context design**: Aggregates (`orchestration-and-bounded-contexts` + `conventions-and-vo-entity-modeling`) + Service Layer
- **Repository design**: Repositories + Coupling & Dependency Management
- **Repository testing**: Repositories (`repository-testing-strategies`) + Testing Strategy
- **Infrastructure leaks**: Repositories (`infrastructure-leaks-and-structural-coupling`) + Coupling & Dependency Management
- **CQRS / read-write separation**: Repositories (`orm-mapping-collaborators-and-cqrs`) + Aggregates (`orchestration-and-bounded-contexts`)
- **Domain events (full coverage)**: Domain Events (all lessons) + Aggregates (`domain-events-and-aggregate-testing`)
- **Event publishing strategy review**: Domain Events (`domain-event-publishing-strategies`)
- **Event granularity / naming review**: Domain Events (`event-granularity-and-semantics` + `event-naming-and-versioning`)
- **Event subscriber review**: Domain Events (`derived-use-cases-and-event-subscribers`)
- **Internal vs external events**: Domain Events (`internal-external-events-and-enrichment`)
- **Legacy refactoring with events**: Domain Events (`refactoring-legacy-systems-with-domain-events` + `change-data-capture-for-legacy-events`)
- **Event bus / DI wiring review**: Domain Events (`event-bus-implementation-and-di-integration`)
- **Projections / read model review**: Projections (all lessons) + Domain Events
- **Cross-context data resolution**: Projections (`resolving-cross-context-data-in-projections`)
- **Materialized views vs projections**: Projections (`decision-criteria-for-data-modeling`)
- **Identifier strategy (UUID/sequential/NanoID)**: Aggregates (`uuids-integrity-and-validation` + `non-uuid-identifiers`)
- **Primitives pattern (toPrimitives/fromPrimitives)**: Aggregates (`primitives-pattern`)
- **Gateway pattern (non-persistence collaborators)**: Repositories (`repository-full-entities-and-gateway-pattern`)
- **ORM mapping strategy**: Repositories (`orm-mapping-collaborators-and-cqrs`)
- **Hexagonal architecture review (backend)**: Hexagonal Architecture (Backend) + Coupling & Dependency Management + Testing Strategy
- **Hexagonal architecture review (frontend)**: Hexagonal Architecture (Frontend) + Frontend Testing + Component Architecture
- **Frontend testing review**: Frontend Testing (all) + Testing Strategy
- **Layer violation review**: Hexagonal Architecture (Backend) (`hexagonal-layers-and-dependency-rule`) + Coupling & Dependency Management
- **Legacy migration review**: Hexagonal Architecture (Frontend) (`migrating-jquery-to-hexagonal`) + Refactoring
- **Strategic DDD / bounded context design**: Strategic DDD (all lessons) + Aggregates + Domain Events
- **Bounded context definition / comparison**: Strategic DDD (`ddd-overview-and-concepts` + `defining-bounded-contexts-and-modular-architecture`)
- **Module promotion to bounded context**: Strategic DDD (`promoting-modules-to-bounded-contexts`) + Aggregates (`conventions-and-vo-entity-modeling`)
- **CQRS decision / command-query bus**: Strategic DDD (`hexagonal-architecture-vs-cqrs`) + Repositories (`orm-mapping-collaborators-and-cqrs`)
- **Cross-module data materialization**: Strategic DDD (`event-driven-cross-module-data-materialization`) + Projections (all lessons)
- **Legacy system migration with events**: Strategic DDD (`legacy-migration-with-domain-events`) + Domain Events (`refactoring-legacy-systems-with-domain-events`)
- **Code sharing between bounded contexts**: Strategic DDD (`sharing-code-between-bounded-contexts`)
- **Monorepo / multi-repo structure**: Strategic DDD (`monorepos-vs-multirepos-practical-implementation`)
- **Outside-in development workflow**: Strategic DDD (`outside-in-development-and-ubiquitous-language`) + TDD Workflow
- **API aggregation / denormalization strategies**: Strategic DDD (`data-denormalization-and-api-aggregation-strategies`) + Projections
- **DDD adoption / team strategy**: Strategic DDD (`ddd-faq-adoption-async-and-aggregates`)
- **Quick code pattern reference**: Read `CC_RULES/` rules for the relevant category
- **API conventions quick check**: Read `API_RULES/` rules for the relevant category
