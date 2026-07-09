# Plan Template

Use this template to structure the output of every backend architecture plan. Fill in each section based on the user's request and the KB lessons consulted. Remove sections that don't apply (e.g., skip API Contract for pure domain modeling tasks), but always include Context, Testing Strategy, Implementation Sequence, and KB References.

---

## Template

```markdown
# Backend Plan: [Feature/Refactor Name]

## Context

**What**: [One-sentence description of what's being built or changed]
**Why**: [Business motivation or technical driver]
**Tech stack**: [Language, framework, ORM, existing architecture pattern]
**Scope**: [Small / Medium / Large — affects plan depth]

## Domain Model

### Entities

| Entity | Key Properties | Invariants |
|--------|---------------|------------|
| [Name] | [Properties] | [Business rules this entity enforces] |

### Value Objects

| Value Object | Wraps | Why Extract |
|-------------|-------|-------------|
| [Name] | [Primitive(s) it replaces] | [KB principle: e.g., magnet effect, Tell-Don't-Ask] |

### DTOs

| DTO | Used For | Maps To |
|-----|---------|---------|
| [Name] | [Request/Response/Internal transfer] | [Entity or VO it maps to] |

## Service Layer

### Use Cases

Name use cases as agent nouns: `StudentEnroller`, `CourseCreator`, `OrderConfirmer`.

| Use Case | Input | Output | Dependencies |
|----------|-------|--------|-------------|
| [Name] | [DTO or primitives] | [Result type] | [Repositories, services] |

### Domain Services (if needed)

| Service | Responsibility | Why Not in Entity |
|---------|---------------|-------------------|
| [Name] | [What it coordinates] | [Crosses aggregate boundaries / needs external data] |

## Infrastructure

### Ports (Interfaces)

| Port | Methods | Purpose |
|------|---------|---------|
| [Name] | [Method signatures] | [What it abstracts] |

### Adapters

| Adapter | Implements | Technology |
|---------|-----------|-----------|
| [Name] | [Port name] | [ORM, HTTP client, message broker, etc.] |

## API Contract

### Endpoints

| Method | Path | Request Body | Response | Status Codes |
|--------|------|-------------|----------|-------------|
| [GET/POST/...] | [/path] | [Shape or "N/A"] | [Shape] | [200, 201, 404, etc.] |

### URL Conventions

- Verb-free, kebab-case, pluralized resource paths: `/order-items/{id}` not `/getOrderItem/{id}`
- Query parameters use snake_case: `?sort_by=name&page_size=20`
- Max 2-3 levels of nesting — flatten with query params if deeper
- No `/api` prefix — use host-based separation (e.g., `api.example.com`)

[KB: url-design-and-resource-naming]

### Search vs Find Semantics

- **Search** (returns empty collection): [Which endpoints]
- **Find** (throws if not found): [Which endpoints]

[KB: test-structure-srp-and-given-when-then, test-doubles-and-maintainable-tests]

### JSON Conventions

- Properties use snake_case: `first_name`, `created_at`
- Enum values use UPPER_SNAKE_CASE: `ORDER_CONFIRMED`, `PAYMENT_PENDING`
- Boolean properties are never null — default to `false`
- Response body is always a top-level JSON object (no bare arrays)
- Money amounts use structured object: `{ "amount": 99.95, "currency": "EUR" }`
- Temporal properties use `_at` suffix for timestamps, `_date` for dates

[KB: json-payload-conventions]

### Error Response Format

Use Problem JSON (RFC 7807) for all error responses:

    {
      "type": "https://example.com/problems/{error-type}",
      "title": "{Human-readable title}",
      "status": {HTTP status code},
      "detail": "{Specific error description}",
      "instance": "{Request path}"
    }

- 422 for validation errors (not 400)
- Never expose stack traces, SQL, or internal paths

[KB: http-methods-and-status-codes]

### Pagination Strategy

| Strategy | When to Use |
|----------|------------|
| **Cursor-based** | Default for most list endpoints — stable, performant |
| **Offset-based** | Only when clients need random page access |

- Include `next`/`prev` navigation links in response
- Avoid total count (expensive for large datasets)
- Default page size with configurable `page_size` param

[KB: headers-performance-and-pagination]

### Compatibility

- [ ] No fields removed or renamed in existing responses
- [ ] New fields are optional with sensible defaults
- [ ] Enum values only added, never removed (use open enums for extensibility)
- [ ] URL structure stable — no path changes to existing endpoints
- [ ] Prefer compatible extensions over versioning

[KB: compatibility-versioning-and-deprecation]

## File Structure

Module-first organization — each business module contains its own hexagonal layers:

```
src/
├── [module-name]/          (e.g., students/, courses/, enrollments/)
│   ├── application/
│   │   └── [use-case files]    (e.g., StudentEnroller.ts)
│   ├── domain/
│   │   ├── [entity files]
│   │   └── [value-object files]
│   └── infrastructure/
│       └── [adapter files]

test/
├── [module-name]/
│   ├── application/
│   │   └── [unit test files]
│   ├── domain/
│   │   └── [unit test files]
│   └── infrastructure/
│       └── [integration test files]
```

## Testing Strategy

Classification-aware. Pick the test layer from user framing and document it here. Defaults to feature flow unless the task is clearly a bug, refactor, or explicit test-coverage request.

### Classification

| Field | Value |
|-------|-------|
| **User framing** | [Verbatim trigger words: "add" / "fix" / "refactor" / "add tests to X" / ambiguous → clarifying question asked] |
| **Flow** | [Feature / Bug / Refactor / Explicit test coverage] |
| **Chosen test layer** | [Unit / Integration / Acceptance] |
| **Rationale** | [One sentence — why this layer] |

### Default: Feature Flow → Unit Tests Only

| Layer | What to Test | Count | Speed |
|-------|-------------|-------|-------|
| **Unit** | Each use case with infrastructure mocked | [N per use case] | Fast |

Zero integration tests, zero acceptance tests, zero E2E for features. Infrastructure adapters are written but not tested. The first adapter bug in an unharnessed project triggers harness setup as `FIX_IN_THIS_TASK` tech debt.

### Bug Flow: §4.3 Red-Test Classification (when applicable)

Classify the bug from its diagnosed root cause (not the ticket wording), then pick the layer from the §4.3 table in [ADR 0007](../../../docs/adr/0007-feature-stripe-and-red-test-bug-classification.md). The lowest layer that reliably reproduces the bug wins:

- **Unit** — business-logic error observable with mocked infra
- **Integration** — inter-module/contract error requiring real infra
- **Acceptance / E2E** — critical user-flow error needing multi-collaborator wiring, with written justification below
- **Visual / UX** (data correct, looks wrong) — QA validation; no automated backend test
- **Misuse** (allowed but should not be) — an input-validation/permission rule, which itself is a unit test; docs/UX when there is no rule to assert

Routing a bug to a non-test outcome is **justify-or-test**: record a one-line justification; write the test when the class is ambiguous.

**Justification** (escalation above unit, or a non-test §4.3 outcome): [Required for acceptance/E2E, or for a visual/UX or no-rule misuse bug]

### Refactor Flow: Same-Layer Rule (when applicable)

Characterization tests live at the same layer as the refactored code. Domain/use case → unit. Adapter → integration. Multi-collaborator → acceptance. No user approval required.

### Test Doubles

| Dependency | Double Type | Why |
|-----------|-------------|-----|
| [Repository] | [Stub/Mock/Fake] | [What behavior to simulate] |
| [External service] | [Stub] | [Isolate from I/O] |

Mock only infrastructure ports. **Never mock domain services.**

### Test Data

- Use Object Mother pattern for entity/VO creation in tests
- Named factory methods: `StudentMother.enrolled()`, `CourseMother.full()`, `OrderMother.confirmed()`
- Faker wrapped behind anti-corruption Mothers (`UuidMother.random()`), never called directly from domain Mothers

### High-Risk Advisory (architect use)

If the task touches auth, payments, PII, or public API keywords, the architect emits a one-line advisory here. Example:

> "This touches payments; consider explicitly requesting acceptance test coverage if that's in scope."

Advisory-only. The architect never unilaterally recommends deeper layers — only the user can authorize moving above the unit layer for features.

[KB: unit-testing-and-test-pyramid, test-doubles-and-maintainable-tests, test-structure-srp-and-given-when-then, testing-with-object-mothers]

### TDD Flow: Classification → Layer Choice → Red-Green-Refactor

1. **Classify the task**: feature / bug / refactor / explicit test coverage (user framing, never reclassify unilaterally)
2. **Choose the test layer**: feature → unit; bug → §4.3 classification (lowest layer that reproduces the root cause; visual/UX and misuse rows via justify-or-test, see ADR 0007); refactor → same layer as refactored code
3. **Red-Green-Refactor at that layer**: failing test first, minimum code to pass, then clean up with tests green

[KB: tdd-red-green-refactor-and-tcr, atdd-practical-example-with-tdd (inner TDD loop only; outer ATDD wrapper dropped as default)]

## Simplicity Assessment

- [ ] Factory methods preferred over builder pattern for objects with required-only fields — builders justified only for 4+ optional parameters
- [ ] Private methods preferred until a third use case needs the same logic (Rule of Three)
- [ ] No speculative methods, enum values, or database indexes beyond current requirements (YAGNI)
- [ ] Interfaces only where justified: test doubles for I/O boundaries, programmatic introspection — no generic UseCase interface
- [ ] Duplication type identified before extraction: literal duplication extracts, structural may need snapshots, conceptual may be intentional

[KB: four-rules-overview, yagni-and-premature-abstractions, code-duplication-types-and-strategies]

## Tech Debt Impact (MANDATORY)

### Inventory

| Item | Location | Type | Classification |
|------|----------|------|----------------|
| [Tech debt item] | [File/module] | [God class / missing tests / tight coupling / etc.] | [FIX_IN_THIS_TASK / PROPOSE_FOLLOW_UP] |

### Resolution Plan

- **FIX_IN_THIS_TASK items**: [How each will be resolved during implementation]
- **PROPOSE_FOLLOW_UP items**: [Why they can't be fixed now, what the follow-up task should contain]

### DDD/Hexagonal Assessment

- **Current state**: [Compliant / Partially compliant / Non-compliant]
- **Patterns in place**: [What already follows DDD/hexagonal — domain separation, ports/adapters, aggregate boundaries]
- **Migration strategy** (if non-compliant): [Concrete steps to move toward DDD/hexagonal within this task's scope]

[KB: applied-solid-principles, refactoring-strategies-and-technical-debt]

## Implementation Sequence

Commit-sized steps, each leaving the codebase green:

1. **[Step name]**: [What to do] — [Which tests to write]
2. **[Step name]**: [What to do] — [Which tests to write]
3. ...

## KB References

| Principle Applied | Source |
|------------------|--------|
| [Principle] | [KB: lesson-filename] |
| [Principle] | [KB: lesson-filename] |
```

---

## Adaptation Rules

- **Small feature** (single endpoint, 1-2 entities): Compact the template — merge Domain Model and Service Layer into a single section, skip Domain Services
- **Refactoring task**: Replace Domain Model / Service Layer / Infrastructure with Before/After comparison and Refactoring Steps. Keep Testing Strategy.
- **Domain modeling only**: Expand Domain Model, skip API Contract and File Structure
- **Large system**: Add a high-level architecture diagram section before Domain Model. Use this template per bounded context.
- **Testing plan only**: Skip Domain Model / Service Layer / Infrastructure. Expand Testing Strategy with per-component details.
- **API-heavy feature**: Expand API Contract with all sub-sections — URL conventions, JSON conventions, error format, pagination strategy, and compatibility checklist
- **All task types**: Tech Debt Impact is always included regardless of task type — it is a mandatory section that cannot be skipped or adapted away
