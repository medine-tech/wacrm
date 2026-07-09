# Testing Strategy Guide

Condensed testing principles synthesized from the knowledge base, adapted for frontend development. Each section cites the source lesson for deeper reading.

---

## Default Test Scope

For features and improvements, the default is **component tests only** — a single-layer stripe at the component level. The frontend test pyramid is reinterpreted as a single layer for feature work; integration and E2E tests are reserved for bug-flow and refactor-flow situations. [KB: unit-testing-and-test-pyramid]

- **Feature / improvement** → component tests via React Testing Library + MSW (or equivalent) + User Event. A "unit" in frontend is a component or hook — render it, interact with it, assert visible output. Mock only external dependencies (API calls via MSW, browser APIs via `spyOn`). Never mock child components unless they have heavy side effects. [KB: unit-testing-and-test-pyramid, introduction-to-testing-library]
- **Bug** → §4.3 red-test classification, lowest layer that reproduces the root cause (see Classification & Layer Selection).
- **Refactor** → same layer that covers the refactored code (see Classification & Layer Selection).
- **Explicit "add tests to X" request** → whatever layer X lives in.

Integration tests and E2E tests are **not** the default for feature work. Data-fetching and composition code is still *written* in feature slices — it just isn't *tested* at integration level until a bug requires it or a refactor lives at that layer.

## Classification & Layer Selection

Classification is **user-framed**. Pin to the user's wording; never reclassify unilaterally.

- **"fix / regression / broken / bug / error"** → bug flow
- **"add / new / improve / support"** → feature flow
- **"refactor / extract / rename / clean up"** → refactor flow
- **"add tests to X"** → explicit test-coverage request
- **Ambiguous** → ask one clarifying question

### Feature Flow — Single-Layer Stripe

Component tests only. RTL + MSW + User Event. Data-fetching code is still written but not tested at integration level by default. Inner TDD loop (red-green-refactor) at the component layer — no outer ATDD wrapper. [KB: tdd-red-green-refactor-and-tcr, atdd-practical-example-with-tdd (inner TDD loop only)]

### Bug Flow — §4.3 Red-Test Classification

Classify the bug from its diagnosed root cause (not the ticket wording), then pick the layer from the §4.3 table in [ADR 0007](../../../docs/adr/0007-feature-stripe-and-red-test-bug-classification.md). The **lowest layer that reliably reproduces the bug** wins:

- **Component** — business-logic error observable with MSW-mocked API (most frontend bugs)
- **Integration (RTL + MSW)** — inter-module/contract error requiring real data-fetching composition across components
- **E2E (Playwright)** — critical user-flow error needing multi-collaborator browser-level wiring; needs written justification
- **Visual / UX** (data correct, looks wrong) — QA validation + optional visual test or documented manual checklist; no automated red test
- **Misuse** (allowed but should not be) — an input-validation/permission rule, which itself is a component test; docs/UX when there is no rule to assert

Routing a bug to a non-test outcome is **justify-or-test**: record a one-line justification; when the class is ambiguous, write the test. Workflow: write the reproducing test → watch it fail → fix → watch it go green → simplify. [KB: fragile-tests-and-bug-reproduction]

### Refactor Flow — Same-Layer Characterization Tests

Characterization tests live at the **layer that covers the refactored code**:

- Presentational component → component test
- Hook → component or `renderHook` test
- Data-fetching composition → integration (RTL + MSW)
- Multi-page flow → E2E (Playwright)

Write characterization tests FIRST at that layer, refactor, tests stay green.

### Explicit Test-Coverage Requests

When the user says "add tests to X", write tests at whatever layer X lives in. The user's framing selects the layer.

### First Composition/E2E Bug in an Unharnessed Project

If a bug requires integration or E2E coverage and the project has no harness yet:

- **Integration** → MSW install and handler scaffolding is classified as `FIX_IN_THIS_TASK` tech debt.
- **E2E** → Playwright install and config is classified as `FIX_IN_THIS_TASK` tech debt.

Harness setup happens before the red test; it is not a follow-up item.

### Feature Uncovers a Latent Bug

Stop the feature slice. Run the bug flow on the discovered bug first (lowest-layer red test). Resume the feature. Two commits.

## High-Risk Advisory

When the work touches **auth / payments / PII / public API** keywords, the architect emits a one-line advisory:

> "This touches payments; consider explicitly requesting acceptance test coverage if that's in scope."

The architect **never unilaterally recommends deeper layers**. The advisory is advisory-only; the user decides whether to escalate the layer selection.

## What Is a "Unit" in Frontend?

A component test covers a single component or hook, not an individual function. The component is the entry point — it renders UI and handles interactions. If your component uses a custom hook internally, test them together through the component. Only test hooks directly with `renderHook` when they're shared across multiple components. [KB: unit-testing-and-test-pyramid]

## Test Doubles for Frontend

Choose the right approach for each dependency:

| Dependency | Approach | When to Use |
|------------|----------|-------------|
| **API calls** | MSW handlers | Any component that fetches data — intercept at the network level, not by mocking fetch |
| **Browser APIs** | `vi.spyOn` / `jest.spyOn` | localStorage, IntersectionObserver, navigator, window.matchMedia |
| **Context providers** | Test wrapper | Wrap the component in a provider with controlled values |
| **Timers** | Fake timers | `vi.useFakeTimers()` for debounce, throttle, setTimeout |
| **Date/time** | Fake timers or injection | `vi.setSystemTime()` for date-dependent rendering |
| **Router** | Memory router | Test navigation without a real browser history |
| **Unused prop** | Dummy | Required prop that isn't exercised in this test — use `noop` or empty object |

MSW is the preferred mocking strategy because it tests the actual fetch/axios calls your component makes, catching issues that mocking the HTTP client would miss. [KB: test-doubles-and-maintainable-tests, dummy-and-spy-test-doubles]

### MSW Handler Organization

Organize MSW handlers alongside the feature they serve:

```
src/features/product/
├── __mocks__/
│   └── handlers.ts          ← MSW handlers for product API
├── __mothers__/
│   └── ProductMother.ts     ← Object Mothers for props and responses
```

Each handler file exports an array of handlers. Compose them in a central `src/mocks/handlers.ts` for the global setup, but keep feature-specific handlers co-located.

```typescript
// src/features/product/__mocks__/handlers.ts
export const productHandlers = [
  http.get('/api/products/:id', ({ params }) => {
    return HttpResponse.json(ProductMother.withId(params.id))
  }),
]
```

## Object Mother Pattern (Frontend-Adapted)

Create test data through factory methods with semantic names. In frontend, Object Mothers produce both **component props** and **API responses**:

### Props Mothers
```typescript
ProductMother.default()           → ProductProps with valid defaults
ProductMother.outOfStock()        → ProductProps with quantity: 0
ProductMother.withDiscount(20)    → ProductProps with 20% discount applied
```

### API Response Mothers
```typescript
ProductResponseMother.single()    → API response for GET /products/:id
ProductResponseMother.list(5)     → API response for GET /products with 5 items
ProductResponseMother.empty()     → API response with empty results
```

Object Mothers centralize test data creation, prevent primitive obsession in test setup, and make Given sections self-documenting. When a prop interface or API response shape changes, you fix one Mother, not 50 tests. [KB: test-doubles-and-maintainable-tests]

### Anti-Corruption Layer for Faker

Domain Mothers wrap Faker — components never call Faker directly in tests. This isolates test infrastructure from the Faker API:

```typescript
// Good: domain Mother wraps Faker
ProductMother.random()  → internally uses faker.commerce.productName(), faker.number.int()

// Bad: test calls Faker directly
const product = { name: faker.commerce.productName(), price: faker.number.int() }
```

### Mothers Absorb Optional Field Changes

When a field becomes optional, the Mother absorbs the change — test call sites don't need updating:

```typescript
ProductMother.withoutDiscount()  → creates Product with no discount field
ProductMother.withDiscount(20)   → creates Product with 20% discount
```

[KB: testing-with-object-mothers]

## Given-When-Then for Component Tests

Structure every test in three phases:

1. **Given** (Arrange): Set up MSW handlers, create props via Object Mother, render the component
2. **When** (Act): Simulate user interaction — click, type, submit, scroll
3. **Then** (Assert): Assert visible output — text content, element presence, aria attributes, not internal state

```typescript
it('should show out-of-stock message when product has no inventory', async () => {
  // Given
  const props = ProductMother.outOfStock()

  // When
  render(<ProductCard {...props} />)

  // Then
  expect(screen.getByText('Out of Stock')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /add to cart/i })).not.toBeInTheDocument()
})
```

One test = one scenario. If a requirement breaks, exactly one test should fail (SRP for tests). [KB: test-structure-srp-and-given-when-then, semantic-testing-and-given-when-then-methods]

## Playwright E2E Tests

Playwright E2E tests are **not the default** for feature work. They are reserved for:

- **Bug flow** — the bug requires multi-collaborator browser-level wiring and cannot be reproduced at the component or integration layer (needs written justification in the plan)
- **Refactor flow** — the refactored code is a multi-page flow whose characterization tests naturally live at the E2E layer
- **Explicit test-coverage requests** — the user explicitly asks for E2E coverage of a flow
- **High-risk acceptance tests** — the user acts on an architect advisory (auth / payments / PII / public API) and opts into E2E coverage

If this is the first E2E bug in an unharnessed project, **Playwright installation and config is classified as `FIX_IN_THIS_TASK` tech debt** and completed before the red test. It is not a follow-up item.

Keep E2E tests focused on critical paths. Test edge cases at the component level. [KB: acceptance-testing-practices-and-gherkin-semantics]

### Page Object Pattern

Encapsulate page-specific selectors and actions in Page Objects:

```typescript
class CheckoutPage {
  constructor(private page: Page) {}

  async fillShippingAddress(address: AddressMother) {
    await this.page.getByLabel('Street').fill(address.street)
    await this.page.getByLabel('City').fill(address.city)
  }

  async submitOrder() {
    await this.page.getByRole('button', { name: /place order/i }).click()
  }

  async expectConfirmation(orderId: string) {
    await expect(this.page.getByText(`Order ${orderId}`)).toBeVisible()
  }
}
```

### E2E Test Structure

```typescript
test('should complete checkout with valid shipping address', async ({ page }) => {
  // Given
  const checkout = new CheckoutPage(page)
  await page.goto('/checkout')

  // When
  await checkout.fillShippingAddress(AddressMother.valid())
  await checkout.submitOrder()

  // Then
  await checkout.expectConfirmation()
})
```

## Mocking Approach Selection

Three approaches ranked by recommendation: (1) **Repository-pattern mocking** — mock at the repository interface, test business logic in isolation. Lowest fragility, zero backend coupling. (2) **MSW interception** — intercept at the network level, test the actual fetch/axios calls. Medium fragility, catches HTTP-layer bugs. (3) **Direct fetch spying** — spy on `window.fetch` or `axios`. Highest fragility, tightly coupled to HTTP client implementation. Choose based on what you're testing: business logic → repository mock, integration behavior → MSW, legacy code without abstractions → fetch spy. Don't mock encapsulated NPM libraries with no I/O — test them through their public API. [KB: mocking-strategies-jest-and-msw]

## Global Store Testing

Test components with global state (Vuex, Redux, Zustand) using the **real store**, not a mocked one. Mocking the store bypasses reducer logic, middleware, and state shape validation — the test proves nothing about real behavior. Build a **custom render function** that wraps the component in the store provider (plus i18n, router, and other plugins), re-export Testing Library's utilities from a shared `test-utils` module to eliminate per-test boilerplate. Use **Test Object Factories** (Fishery + Faker) to generate randomized test data through semantic factory methods — reduces noise, repetition, and fragility. [KB: global-store-test-factories-and-snapshots]

## Common Testing Library Mistakes

Five rapid-fire errors to avoid: (1) Using `container.querySelector` instead of `screen` queries — loses Testing Library's accessibility benefits. (2) Wrong query variant — `getBy` throws on missing elements (use for "must exist"), `queryBy` returns null (use for "must not exist"), `findBy` waits (use for async). (3) Arbitrary `sleep()` calls — replace with `findBy*` or `waitFor` for async content. (4) Side effects inside `waitFor` — clicks or state changes repeat on every poll cycle; put only assertions inside. (5) Shared `beforeEach` hiding test context — prefer explicit setup per test or Page Object helpers over shared mutable state.

**Query priority** (accessibility-first): `getByRole` > `getByLabelText` > `getByPlaceholderText` > `getByText` > `getByTestId`. Prefer User Event over `fireEvent` — it simulates realistic user interactions (focus, key events, composition events) that `fireEvent` skips. [KB: introduction-to-testing-library, common-testing-errors-and-best-practices]

## Deterministic Tests

Common sources of flakiness in frontend tests:

- **Async rendering**: Always use `findBy*` queries (which wait) instead of `getBy*` for content that appears after async operations. Use `waitFor` sparingly — prefer `findBy*`.
- **Animations**: Disable CSS animations in test setup or use `waitForElementToBeRemoved` for exit animations.
- **Timers**: Use fake timers for debounce, throttle, and setTimeout. Advance time explicitly with `vi.advanceTimersByTime()`.
- **Date/time**: Use `vi.setSystemTime()` to control the system clock. Never rely on `new Date()` producing a specific value.
- **Random values**: If Object Mothers use random data (faker), pin the seed or use deterministic values in assertions.
- **Network timing**: MSW handlers respond synchronously by default, eliminating network timing issues.

[KB: flaky-tests-and-time-dependent-testing]

## Test Naming Convention

Test names should describe the scenario using the behavior being tested:

```typescript
// Good — describes behavior
it('should disable submit button while form is submitting')
it('should show validation error when email is invalid')
it('should redirect to dashboard after successful login')

// Bad — describes implementation
it('should set isLoading to true')
it('should call useState with initial value')
it('should render div with class active')
```

## Fragile Tests vs. Robust Tests

Tests that assert on internal component state, CSS classes, or implementation details break on harmless refactors. A test that checks `expect(component.state.isLoading).toBe(true)` breaks when you rename the state variable, even though behavior is unchanged.

Prefer behavior-based tests that interact through the component's public surface:
- **Happy path**: Render the component with props via Object Mother, interact via user events, assert on visible output (text, elements, ARIA attributes).
- **Error path**: Set up MSW handlers to return error responses, render the component, assert the error message is displayed to the user.

Component refactors (extracting sub-components, renaming internal state, moving logic to hooks) should never break tests. If they do, the tests are coupled to implementation, not behavior. [KB: fragile-tests-and-bug-reproduction]

## Bug Reproduction Workflow

Before fixing any bug:

1. **Investigate** the component and its data flow to understand the expected behavior
2. **Write a reproducing test** that fails because of the bug — not a test that verifies the fix
3. **Fix the bug** and watch the test go green
4. **Simplify** — the passing test guarantees any simplification of the fix is safe

A common frontend bug pattern: error states not displaying because the component checks for a specific error shape instead of any error response, causing 409 Conflict or 422 Unprocessable Entity errors to be silently swallowed. [KB: fragile-tests-and-bug-reproduction]

## CI Integration

Every PR should pass these gates:

1. **Type check**: `tsc --noEmit` passes with no errors
2. **Lint**: ESLint passes with no errors
3. **Component + integration tests**: Full test suite passes
4. **E2E tests**: Playwright suite passes (can run on CI with headless browser)
5. **Build**: Production build completes without errors

Run component tests and lint in parallel where possible. E2E tests run after build. [KB: continuous-integration-pipelines]

## Day-to-Day Policy

- Never commit with failing tests
- Test behavior, not implementation — don't assert on internal state, CSS classes, or component structure
- "Listen to your tests" — if testing is painful (too many wrappers, complex setup), the component is too coupled. Too many context providers in your test wrapper often means too much global state. [KB: course-conclusions-and-next-steps]
- Prefer integration tests that render a composition over unit tests that mock all children — the composition test catches more bugs with less mocking overhead
