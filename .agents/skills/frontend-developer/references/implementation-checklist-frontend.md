# Implementation Checklist

Verify each applicable item after implementation. Skip items that don't apply to the task and note why in your report.

---

## Components

- [ ] Each component has a single responsibility — one reason to change
- [ ] Server Components by default; `'use client'` only for hooks, browser APIs, or event handlers
- [ ] `'use client'` boundaries pushed to the leaves of the component tree
- [ ] Props interfaces defined with TypeScript — no `any`, no inline object types in function signatures
- [ ] Boolean props use is/has/can prefix: `isOpen`, `hasError`, `canSubmit`
- [ ] No boolean arguments controlling branching — use specialized components instead (`<PriceBadge />` and `<DiscountBadge />`, not `<Badge isDiscount={true} />`)
- [ ] Guard clauses for early returns (loading, error, empty states) before the main render

[Vercel: server-serialization, rerender-memo | KB: clean-code-practices-in-user-controller-design, avoiding-boolean-arguments-and-default-values]

## State Management

- [ ] Derived state calculated during render, never synced with useEffect + setState
- [ ] Functional setState used for updates that depend on previous state: `setState(prev => ...)`
- [ ] Lazy state initialization for expensive computations: `useState(() => computeExpensive())`
- [ ] URL state (searchParams, query strings) for shareable/bookmarkable state
- [ ] Refs used for transient values that don't trigger re-renders (timers, previous values, DOM measurements)
- [ ] No unnecessary global state — local state + prop drilling unless truly shared across distant components

[Vercel: rerender-derived-state-no-effect, rerender-functional-setstate, rerender-lazy-state-init, rerender-use-ref-transient-values]

## Data Fetching

- [ ] Parallel fetching for independent data: `Promise.all()` or sibling Server Components
- [ ] Suspense boundaries wrapping async Server Components for progressive streaming
- [ ] `React.cache()` for per-request deduplication in Server Components
- [ ] SWR/React Query for client-side data with automatic deduplication and revalidation
- [ ] Loading and error states handled — Suspense fallbacks + error boundaries per data boundary
- [ ] Minimum data serialized from Server to Client Components — only what the client needs

[Vercel: async-parallel, async-suspense-boundaries, server-cache-react, client-swr-dedup, server-serialization, server-parallel-fetching]

## Performance

- [ ] Direct imports from specific module paths — no barrel file imports (`index.ts`)
- [ ] Dynamic imports (`next/dynamic` or `React.lazy`) for heavy components not needed on initial render
- [ ] Third-party scripts deferred: `next/script strategy="afterInteractive"` or loaded after hydration
- [ ] `React.memo` only for components with expensive rendering and frequent parent re-renders — not by default
- [ ] Static JSX hoisted outside components to prevent re-creation on every render
- [ ] Conditional rendering uses ternary (`condition ? <A/> : <B/>`), not `&&`
- [ ] Event handlers in refs for stable references when needed as effect dependencies

[Vercel: bundle-barrel-imports, bundle-dynamic-imports, bundle-defer-third-party, rerender-memo, rendering-hoist-jsx, rendering-conditional-render, advanced-event-handler-refs]

## Naming

- [ ] Component names describe what they render: `ProductCard`, `CheckoutForm`, `OrderSummary`
- [ ] Hook names start with `use` and describe what they manage: `useCart`, `useProductSearch`, `useFormValidation`
- [ ] Boolean variables/state use is/has/can prefix: `isLoading`, `hasItems`, `canCheckout`
- [ ] Event handler props use `on` prefix: `onClick`, `onSubmit`, `onFilterChange`
- [ ] Event handler functions use `handle` prefix: `handleClick`, `handleSubmit`, `handleFilterChange`
- [ ] File names match component names: `ProductCard.tsx` exports `ProductCard`
- [ ] Test files co-located or follow project convention: `ProductCard.test.tsx`

[KB: srp-refactoring-and-naming-conventions, clean-code-practices-in-user-controller-design]

## Testing

Classification-aware checklist. The task's classification (feature / bug / refactor / explicit coverage) drives which layer gets the red test. See the testing strategy guide for details.

### Default: Component Tests Only (Features)

- [ ] Task classified as feature/improvement → component tests only (no integration, no E2E by default)
- [ ] Failing component test written before production code (Red-Green-Refactor at the component layer)
- [ ] Component tests use React Testing Library + MSW + User Event — test behavior, not implementation
- [ ] Query priority followed: `getByRole` > `getByLabelText` > `getByPlaceholderText` > `getByText` > `getByTestId`
- [ ] User Event used over `fireEvent` for interactions
- [ ] API calls mocked with MSW handlers, not by mocking fetch/axios directly
- [ ] Child components are not mocked unnecessarily (only ports at the edges: API, browser APIs, timers, router)
- [ ] Object Mother pattern for test props and API responses with semantic factory methods
- [ ] Faker anti-corruption layer — domain Mothers wrap Faker, tests never call Faker directly
- [ ] Mothers absorb optional field changes — `ProductMother.withoutDiscount()` instead of updating test call sites
- [ ] Given-When-Then structure in every test with descriptive test names
- [ ] One scenario per test — if a requirement breaks, exactly one test fails

### Bug Flow: §4.3 Red-Test Classification

- [ ] Bug classified from its diagnosed root cause (not the ticket wording) and the layer picked from the §4.3 table in ADR 0007 — business-logic → component (MSW-observable); inter-module/contract → integration (real composition); critical user-flow → E2E with written justification; the lowest layer that reliably reproduces the bug wins
- [ ] Visual/UX and misuse §4.3 rows handled via justify-or-test: visual/UX → QA validation + optional visual test/manual checklist, no automated test; a misuse input-validation/permission fix still gets a component test; a no-rule case carries a one-line written justification
- [ ] Test fails because of the bug before the fix is written
- [ ] If the project has no harness yet (MSW for integration, Playwright for E2E), harness setup is classified and completed as `FIX_IN_THIS_TASK` tech debt before the red test

### Refactor Flow: Same-Layer Characterization Tests

- [ ] Characterization tests written FIRST at the layer that covers the refactored code (presentational component → component; hook → component or `renderHook`; data-fetching composition → integration; multi-page flow → E2E)
- [ ] Tests stay green throughout the refactor

### Explicit Test-Coverage Requests

- [ ] When the user requested "add tests to X", tests written at whatever layer X lives in (user framing selects the layer)

### High-Risk Advisory

- [ ] High-risk advisory from architect acknowledged (auth / payments / PII / public API). If the user opted into deeper coverage, layer selection reflects that; otherwise default single-layer stripe applies.

### Test Hygiene (All Layers)

- [ ] Test folder structure follows project convention (co-located or separate directory)
- [ ] Queries use `screen` object — no `container.querySelector` or destructured queries from `render()`
- [ ] Query variant matches intent: `getBy` for must-exist, `queryBy` for assert-absence, `findBy` for async
- [ ] No arbitrary `sleep()` in tests — use `findBy*`, `waitFor`, or `waitForElementToBeRemoved`
- [ ] No side effects inside `waitFor` callbacks — only assertions
- [ ] Fake timers for polling/setInterval — `useFakeTimers` + `runOnlyPendingTimers`
- [ ] Component unmount cleans up intervals — no ghost intervals in SPAs
- [ ] CI pipeline enforces test execution on PRs via required status checks

[KB: unit-testing-and-test-pyramid, test-doubles-and-maintainable-tests, test-structure-srp-and-given-when-then, testing-with-object-mothers, introduction-to-testing-library, tdd-red-green-refactor-and-tcr, atdd-practical-example-with-tdd, common-testing-errors-and-best-practices, tdd-live-coding-comments-and-polling, implementing-ci-with-github-actions]

## Code Quality

- [ ] Guard clauses used instead of nested if-else
- [ ] Functions/components at a single level of abstraction
- [ ] No premature abstractions — Rule of Three before extracting a shared component, hook, or utility
- [ ] Comments only for "why", never for "what" — code is self-documenting
- [ ] Follows existing codebase formatting, linting rules, and import conventions

[KB: introduction-to-clean-code-and-refactoring-practices, code-formatting-and-linting-conventions]

## Simple Design

- [ ] No premature shared components, hooks, or utilities — Rule of Three before extracting
- [ ] Factory methods or static creators used for complex object construction — no builder pattern for objects with required-only fields
- [ ] No speculative props, config options, or feature flags beyond current requirements (YAGNI)
- [ ] Duplication type assessed before extraction — two similar components may be intentionally separate (conceptual duplication)
- [ ] Tests hardcode expected values rather than sharing references with production code (SSOT exception)

[KB: four-rules-overview, yagni-and-premature-abstractions, code-duplication-types-and-strategies]

## Refactoring (when applicable)

- [ ] Preparatory refactoring workflow followed: test existing behavior → refactor → test each new component
- [ ] Refactoring and feature work in separate commits
- [ ] Tests stay green throughout refactoring — no "trust me it'll work when I'm done"
- [ ] Scout Rule applied — leave code cleaner than you found it (within scope)
- [ ] Components extracted one at a time, not all at once

[KB: refactoring-strategies-and-technical-debt]

## Strict Mode Gates (MANDATORY)

These gates are verified by the reviewer. Failing any gate triggers the fix-review loop.

- [ ] **Tech debt reduction**: Tech debt inventory exists, all FIX_IN_THIS_TASK items resolved, area is measurably cleaner than before
- [ ] **Clean code**: Guard clauses used (no nested if-else), components at single abstraction level, meaningful names, no "what" comments
- [ ] **Test-First Discipline at Chosen Layer**: Failing test at the chosen layer written before production code (red-green-refactor at feature / bug / refactor layer, inner TDD loop only, no outer ATDD wrapper)
- [ ] **Test pyramid**: Component tests for every feature change; integration/E2E only for bugs requiring real composition or refactors whose characterization lives at that layer
- [ ] **Architecture compliance**: New code follows recommended patterns (Server Components default, proper client boundaries, feature-first organization); anti-patterns have a documented migration strategy
- [ ] **Migration strategies**: Every identified anti-pattern has either a fix in this task or a documented follow-up strategy — never "leave as-is" without justification
- [ ] **Overall compliance**: All 6 gates above pass — the reviewer verifies this as a mandatory final check
