# Plan Template

Use this template to structure the output of every frontend architecture plan. Fill in each section based on the user's request and the KB sources consulted. Remove sections that don't apply (e.g., skip Rendering Strategy for a pure state management redesign), but always include Context, Testing Strategy, Implementation Sequence, and KB References.

---

## Template

```markdown
# Frontend Plan: [Feature/Page Name]

## Context

**What**: [One-sentence description of what's being built or changed]
**Why**: [Business motivation or technical driver]
**Tech stack**: [Framework, state management, styling, test setup]
**Scope**: [Small / Medium / Large — affects plan depth]

## Component Tree

### Decomposition

| Component | Responsibility | Server/Client | Props |
|-----------|---------------|---------------|-------|
| [Name] | [What it renders] | [Server / Client] | [Key props it receives] |

### Server/Client Boundaries

```
PageLayout (Server)              ← fetches page data
├── Header (Server)              ← static navigation
├── ProductInfo (Server)         ← fetches product details
│   ├── ImageGallery (Client)    ← interactive carousel
│   └── AddToCart (Client)       ← form with state
├── Reviews (Server + Suspense)  ← async, streamed
│   └── ReviewForm (Client)      ← form with validation
└── Footer (Server)              ← static
```

**Principle**: Push `'use client'` to the leaves. Server Components by default. [Vercel: server-serialization]

## State Management

### State Ownership

| State | Owner | Type | Rationale |
|-------|-------|------|-----------|
| [What state] | [Which component] | [Local / Shared / Server / URL] | [Why this type] |

### Data Flow

- **Props**: [What flows top-down]
- **Context**: [What's truly global — theme, auth, locale]
- **URL state**: [What should be shareable/bookmarkable]
- **Derived state**: [What's calculated during render, not synced] [Vercel: rerender-derived-state-no-effect]

## Data Fetching

### Server-Side

| Data | Component | Strategy | Cache |
|------|-----------|----------|-------|
| [What data] | [Where fetched] | [RSC / getServerSideProps / getStaticProps] | [React.cache / ISR / none] |

### Client-Side

| Data | Component | Strategy | Rationale |
|------|-----------|----------|-----------|
| [What data] | [Where fetched] | [SWR / React Query / fetch] | [Why client-side] |

### Loading & Error States

| Boundary | Fallback | Error Handling |
|----------|----------|----------------|
| [Suspense boundary] | [Skeleton / spinner] | [Error boundary / retry] |

## Rendering Strategy

| Route | Strategy | Rationale |
|-------|----------|-----------|
| [/path] | [SSR / SSG / ISR / CSR / Streaming] | [Why this strategy] |

**Dynamic imports**: [Which components are lazy-loaded and why] [Vercel: bundle-dynamic-imports]

## Performance Checklist

### Bundle Size
- [ ] No barrel file imports [Vercel: bundle-barrel-imports]
- [ ] Heavy components use dynamic imports [Vercel: bundle-dynamic-imports]
- [ ] Third-party scripts deferred after hydration [Vercel: bundle-defer-third-party]
- [ ] Conditional modules loaded only when needed [Vercel: bundle-conditional]

### Waterfall Elimination
- [ ] Independent fetches run in parallel [Vercel: async-parallel]
- [ ] Suspense boundaries stream slow content [Vercel: async-suspense-boundaries]
- [ ] Await deferred to branches where needed [Vercel: async-defer-await]

### Re-render Prevention
- [ ] Expensive components memoized [Vercel: rerender-memo]
- [ ] Effect dependencies use primitives [Vercel: rerender-dependencies]
- [ ] Derived state calculated during render [Vercel: rerender-derived-state-no-effect]
- [ ] Functional setState for stable callbacks [Vercel: rerender-functional-setstate]

## Tech Debt Impact (MANDATORY)

### Inventory

| Item | Location | Type | Classification |
|------|----------|------|----------------|
| [Tech debt item] | [Component/module] | [Component duplication / CSS shotgun surgery / missing boundaries / etc.] | [FIX_IN_THIS_TASK / PROPOSE_FOLLOW_UP] |

### Resolution Plan

- **FIX_IN_THIS_TASK items**: [How each will be resolved during implementation]
- **PROPOSE_FOLLOW_UP items**: [Why they can't be fixed now, what the follow-up task should contain]

### Architecture Assessment

- **Current state**: [Compliant / Partially compliant / Non-compliant]
- **Patterns in place**: [Server Components default, proper client boundaries, feature-first organization, design tokens]
- **Migration strategy** (if non-compliant): [Concrete steps to address anti-patterns within this task's scope]

[KB: refactoring-strategies-and-technical-debt]

## File Structure

Feature-first organization — each feature owns its components, hooks, and tests:

```
src/
├── features/
│   └── [feature-name]/
│       ├── components/
│       │   ├── [Component].tsx
│       │   └── [Component].test.tsx
│       ├── hooks/
│       │   └── use[Hook].ts
│       ├── lib/
│       │   └── [utilities].ts
│       └── types.ts
├── components/              ← shared/reusable components
├── lib/                     ← shared utilities
└── app/ (or pages/)         ← route definitions
```

## Testing Strategy

Classification-aware. The task classification drives layer selection; the pyramid is reinterpreted as a single-layer stripe for feature work. [KB: unit-testing-and-test-pyramid]

### Classification

**Task type**: [feature / bug / refactor / explicit test-coverage request]
**User framing**: [quote the phrasing that drove the classification]

### Default Feature Flow — Component Layer Only

For feature work, the default is **component tests only**. No integration or E2E tests by default. Data-fetching and composition code is still written in feature slices, but not tested at integration level until a bug or refactor requires it.

| Layer | What to Test | Tools | Count |
|-------|-------------|-------|-------|
| **Component** | User interactions, rendered output, state transitions | RTL + MSW + User Event | [N per component] |

[KB: unit-testing-and-test-pyramid, introduction-to-testing-library]

### Bug Flow — §4.3 Red-Test Classification

Only fill in if task is classified as a bug. Classify from the diagnosed root cause (not the ticket wording), then pick the layer from the §4.3 table in [ADR 0007](../../../docs/adr/0007-feature-stripe-and-red-test-bug-classification.md) — the lowest layer that reliably reproduces the bug wins.

| §4.3 Class | Layer Selected | Rationale |
|------------|----------------|-----------|
| [Business-logic / Inter-module / Critical user-flow / Visual-UX / Misuse] | [Component / Integration / E2E / none — QA validation] | [Why this layer; for visual/UX or no-rule misuse, the one-line justify-or-test justification] |

E2E selection requires a written justification: [state the multi-collaborator browser-level wiring that forces this layer]. Visual/UX bugs route to QA validation with no automated test; misuse bugs get a component test when there is an input-validation/permission rule to assert, otherwise a justify-or-test justification. If a harness is missing (MSW or Playwright), its setup is `FIX_IN_THIS_TASK` tech debt.

### Refactor Flow — Same-Layer Characterization Tests

Only fill in if task is classified as a refactor.

| Refactored Code | Layer That Covers It | Test Tool |
|-----------------|----------------------|-----------|
| [Component / hook / composition / multi-page flow] | [Component / `renderHook` / Integration / E2E] | [RTL / RTL + MSW / Playwright] |

### Explicit Test-Coverage Request

Only fill in if the user asked to "add tests to X". Layer selected = layer where X lives.

- **Target**: [what the user asked to cover]
- **Layer**: [component / integration / E2E]
- **Rationale**: [which layer X lives at]

### High-Risk Advisory (Advisory-Only)

Fill in only if the architect detected auth / payments / PII / public API keywords:

> [One-line advisory: "This touches X; consider explicitly requesting acceptance test coverage if that's in scope."]

The architect never unilaterally recommends deeper layers. The user decides.

### Test Data

- Object Mother for component props: `ProductMother.withVariants()`, `CartMother.empty()`
- Faker anti-corruption layer — tests never call Faker directly
- MSW handlers for API responses: `handlers/product.ts`, `handlers/cart.ts`

[KB: test-doubles-and-maintainable-tests]

### API Mocking

| Endpoint | MSW Handler | States |
|----------|-------------|--------|
| [GET /api/...] | [handler name] | [success, empty, error] |

### GWT Structure

```
describe('[Component]', () => {
  it('should [expected behavior] when [user action]', () => {
    // Given: [setup with Object Mother]
    // When: [user interaction via User Event]
    // Then: [assertion on visible output via accessibility-first queries]
  })
})
```

Query priority: `getByRole` > `getByLabelText` > `getByPlaceholderText` > `getByText` > `getByTestId`. User Event over fireEvent. [KB: test-structure-srp-and-given-when-then, introduction-to-testing-library]

## TDD Flow

Three-step flow for every task, feature or otherwise:

1. **Classify the task** — pin to the user's framing (feature / bug / refactor / explicit test-coverage). Ambiguous framing → ask one clarifying question. Never reclassify unilaterally.
2. **Choose the test layer**:
   - **Feature** → component layer only
   - **Bug** → §4.3 classification (ADR 0007): lowest layer that reproduces the root cause — component if MSW-observable; integration if real composition required; E2E only for multi-collaborator browser wiring with written justification; visual/UX and misuse rows via justify-or-test
   - **Refactor** → same layer that covers the refactored code
   - **Explicit test-coverage request** → layer where the target code lives
   - **First composition/E2E bug in an unharnessed project** → MSW or Playwright install/config is classified as `FIX_IN_THIS_TASK` tech debt before the red test
3. **Red-Green-Refactor at that layer**:
   - **Red**: Failing test at the chosen layer describing expected behavior
   - **Green**: Minimum production code to pass
   - **Refactor**: Clean up, tests stay green

This is the inner TDD loop only — there is no outer ATDD wrapper around it.

[KB: tdd-red-green-refactor-and-tcr, atdd-practical-example-with-tdd (inner TDD loop only), test-structure-srp-and-given-when-then, test-doubles-and-maintainable-tests, introduction-to-testing-library, unit-testing-and-test-pyramid]

## Implementation Sequence

Commit-sized steps, each leaving the codebase green:

1. **[Step name]**: [What to do] — [Which tests to write]
2. **[Step name]**: [What to do] — [Which tests to write]
3. ...

## KB References

| Principle Applied | Source |
|------------------|--------|
| [Principle] | [Vercel: rule-name] |
| [Principle] | [KB: lesson-filename] |
| [Principle] | [WDG: guideline-name] |
```

---

## Adaptation Rules

- **Small feature** (single component, one route): Compact the template — merge Component Tree and State Management, skip Rendering Strategy and File Structure
- **Performance optimization**: Expand Performance Checklist with specific measurements and before/after. Skip Component Tree and State Management unless relevant.
- **Component refactoring**: Replace Component Tree / State Management with Before/After comparison and Refactoring Steps. Keep Testing Strategy. Recommend preparatory refactoring workflow.
- **Page architecture**: Expand Rendering Strategy and Data Fetching. Add per-route breakdown.
- **Design system**: Expand Component Tree with variant matrix and prop API. Add Accessibility section. Skip Data Fetching and Rendering Strategy.
- **Testing plan only**: Skip Component Tree / State Management / Data Fetching / Rendering Strategy. Expand Testing Strategy with per-component details.
- **All task types**: Tech Debt Impact is always included regardless of task type — it is a mandatory section that cannot be skipped or adapted away
