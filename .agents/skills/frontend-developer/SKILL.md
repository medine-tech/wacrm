---
name: frontend-developer
description: Implement frontend features by writing production components, hooks, and tests grounded in knowledge base principles — outputs files on disk, not conversation text. Use this skill whenever the user asks for frontend implementation, building a React component, writing a hook, fixing a UI bug, refactoring components, or running TDD red-green-refactor at the component layer with React Testing Library + MSW. Make sure to use this skill whenever the user wants frontend code written, tested, or fixed — even if they don't say "developer" — and especially when an architecture plan is already in hand and ready to implement.
---

# Frontend Developer

Implement frontend features by writing production components, hooks, and tests grounded in knowledge base principles. Output is files on disk — components, hooks, tests, and configuration.

## Phase 1: Understand the Task

**Classify the task:** new feature, refactoring, bug fix, or test coverage.

### Classification Routing (MANDATORY)

Classification is **user-framed**. Pin to the user's wording; never reclassify unilaterally.

- **"fix / regression / broken / bug / error"** → bug flow
- **"add / new / improve / support"** → feature flow
- **"refactor / extract / rename / clean up"** → refactor flow
- **"add tests to X"** → explicit test-coverage request; write tests at whatever layer X lives in
- **Ambiguous framing** → ask **one** clarifying question before proceeding. Never guess, never silently promote a feature to a bug (or vice versa).

Classification drives layer selection in Phase 4. Do not change the classification mid-task without the user's explicit direction.

**Discover codebase context:**
- Framework: React, Next.js (App Router vs Pages Router), Remix, Vite
- Rendering strategy: SSR, SSG, CSR, ISR, RSC
- State management: useState/useReducer, Zustand, Redux, Jotai, React Query, SWR
- Styling: CSS Modules, Tailwind, styled-components, Sass
- Component library, test setup, directory structure

**Find a reference implementation.** Mirror its file structure, naming, test organization, coding style. Never invent conventions.

**Ask clarifying questions only when critical.**

## Phase 2: Consult the Knowledge Base

Apply KB principles silently. Only comment for non-obvious "why" decisions.

1. Identify which KB lessons are relevant to this task. Use the document summaries already indexed in the host project's AGENTS.md (the team-convention pointer in every project's root AGENTS.md describes where the KB index lives).

2. Select 1-3 lessons. Read actual files.

3. For testing, also read `references/testing-strategy-guide-frontend.md`.

4. Read `references/implementation-checklist-frontend.md` — verify in Phase 5.

## Phase 3: Implement in Vertical Slices

Each slice is complete — types to component to tests — independently committable and green.

### Strict Mode Pre-Flight (MANDATORY)

1. **Tech Debt Inventory**: Classified as FIX_IN_THIS_TASK or PROPOSE_FOLLOW_UP. If missing, scan yourself.
2. **Architecture Assessment**: If missing, assess the area yourself.

### If refactoring: STOP — different workflow

1. **Characterization tests FIRST.** Render, interact, assert visible output.
2. **Refactor the structure.** All tests green. Extract one component at a time.
3. **Add per-component tests.** After refactored structure is green.

Non-negotiable.

### For new features: test-first vertical slices

**Red-Green-Refactor:**
1. **Red**: Failing test describing expected behavior
2. **Green**: Minimum production code to pass
3. **Refactor**: Clean up, tests stay green

### Test Layer Selection

Before writing the red test, pick the layer from the task classification (see Phase 1):

- **Feature** → component layer only (RTL + MSW + User Event). No integration or E2E tests by default.
- **Bug** → §4.3 red-test classification (see Phase 4 and ADR 0007): the red test lives at the lowest layer that reliably reproduces the diagnosed root cause.
- **Refactor** → **same layer** that covers the refactored code (presentational component → component test; hook → component or `renderHook`; data-fetching composition → integration; multi-page flow → E2E).
- **Explicit test-coverage request** → layer of the target code, as authorized by the user.
- **First composition/E2E bug in an unharnessed project** → MSW install/config or Playwright install/config is classified as `FIX_IN_THIS_TASK` tech debt and completed before the red test.
- **Feature uncovers a latent bug** → stop the feature slice, run the bug flow on the discovered bug (lowest-layer red test), resume the feature. Two commits.

**Slice ordering** — inside-out:
1. **Types and interfaces**: Props, API response types, shared types
2. **Leaf components + tests**: Small, reusable, no data fetching
3. **Custom hooks + tests**: Shared logic. Test with `renderHook` or through components.
4. **Composition components + integration tests**: Parent components with state and data fetching
5. **Route integration**: Wire into page/route, connect data fetching

**Coding principles (applied silently).** The architect's plan is the contract — its `[Vercel: ...]` and `[KB: ...]` citations are the source of truth for each pattern. Apply silently; do not paraphrase the rule into the code. The headlines below are reminders the plan may not call out; when a trigger fires, read the cited rule before writing the code.

- **Server Components by default** [for any new component]: `'use client'` only for hooks, browser APIs, event handlers; push to leaves. [Vercel: server-serialization, server-dedup-props]
- **Derived state during render** [whenever a value is computed from another]: never sync with useEffect + setState. [Vercel: rerender-derived-state-no-effect]
- **Component SRP** [when a component grows]: one reason to change; extract if handling layout, fetching, AND interaction.
- **Parallel fetching** [for independent operations]: `Promise.all()`; `<Suspense>` for streaming. [Vercel: async-parallel, async-suspense-boundaries]
- **Minimize serialization** [at every Server→Client boundary]: pass only needed data.
- **Rule of Three** [before extracting a shared component]: wait for the third instance. [KB: yagni-and-premature-abstractions]
- **Vertical Slicing** [when organizing a feature]: feature-first organization; each feature owns its layers. [KB: hexagonal-vertical-slicing-and-frontend-adaptation]
- **Repository Pattern** [for any persistence call]: abstract behind interface; inject via function parameters. [KB: hexagonal-frontend-course-app-repository-validation]
- **Dual Validation** [for any user-facing form]: domain validation (ensure functions) + real-time UX validation. [KB: hexagonal-frontend-course-app-repository-validation]
- **Client-Side ID Generation** [when creating new aggregates from the client]: UUID; domain owns identity. [KB: hexagonal-frontend-course-app-repository-validation]
- **Value Files** [when shaping a domain value]: type alias + validator + behavior; graduated adoption. [KB: functional-vs-oop-and-value-files]
- **Testing Library Queries** [for every assertion query]: `getByRole > getByLabelText > getByText > getByTestId`; User Event over fireEvent. [KB: introduction-to-testing-library]

## Phase 4: Write Tests

Mirror the reference implementation's test patterns. The layer is already chosen in Phase 3 from the task classification — do not re-derive it here.

### Default: Component Tests Only (Features)

Features and improvements get **component tests only** — single-layer stripe at the component level. No integration or E2E tests by default.

- **Stack**: React Testing Library + MSW + User Event [KB: introduction-to-testing-library]
- **Behavior, not implementation**: click, fill, assert visible output. Never assert internal state or CSS classes.
- **Query priority**: `getByRole` > `getByLabelText` > `getByPlaceholderText` > `getByText` > `getByTestId`. User Event over fireEvent. [KB: introduction-to-testing-library]
- **API calls → MSW** at the network boundary, never by mocking `fetch`/`axios`. Never mock child components unnecessarily. [KB: test-doubles-and-maintainable-tests]
- **Test doubles**: Stub / Spy / Dummy at the edges — mock only ports (API, browser APIs, timers, router). [KB: test-doubles-and-maintainable-tests]
- **Test data**: Object Mother with Faker anti-corruption — `ProductMother.outOfStock()`, `CartMother.withItems(3)`. Tests never call Faker directly.
- **Structure**: Given-When-Then with descriptive names, one scenario per test (SRP for tests). [KB: test-structure-srp-and-given-when-then]
- **Approach per dependency**:
  - API calls → MSW handlers
  - Browser APIs → `spyOn`
  - Context → test wrapper
  - Timers → fake timers

**Data-fetching and composition code is still *written* in feature slices**, it just isn't *tested* at the integration level by default. That layer only gets tests when a bug surfaces that requires real composition (at which point MSW harness setup, or Playwright for an E2E bug, is classified as `FIX_IN_THIS_TASK` tech debt) or when a refactor lives at that layer.

The pyramid is reinterpreted as a **single-layer stripe** for features; the outer ATDD wrapper is dropped. The feature single-layer stripe and the §4.3 bug-classification table are canonically defined in [ADR 0007](../../docs/adr/0007-feature-stripe-and-red-test-bug-classification.md). [KB: unit-testing-and-test-pyramid, atdd-practical-example-with-tdd (inner TDD loop only), tdd-red-green-refactor-and-tcr]

### Bug Flow: §4.3 Red-Test Classification

Classify the bug from its **diagnosed root cause** (not the ticket wording), then pick the layer from the §4.3 table in [ADR 0007](../../docs/adr/0007-feature-stripe-and-red-test-bug-classification.md). The lowest layer that reliably reproduces the bug always wins.

- **Business-logic error** → **component** test — bug is observable with MSW-mocked API (most frontend bugs land here)
- **Inter-module / contract error** → **integration (RTL + MSW)** — bug requires real data-fetching composition across components
- **Critical user-flow error** → **E2E (Playwright)** — multi-collaborator browser-level wiring is required; needs written justification
- **Misuse** (user does something allowed but should not be) → an input-validation or permission rule — that rule **is** a component test; route to docs/UX only when there is genuinely no rule to assert
- **Visual / UX** (data correct, looks wrong) → QA validation + optional visual test or documented manual checklist; no automated red test

Routing a bug to a non-test outcome is **justify-or-test**: record a one-line justification, and when the class is ambiguous, write the test. If the project has no MSW or Playwright harness yet and the bug requires one, the harness install/config is `FIX_IN_THIS_TASK` tech debt and happens before the red test.

### Refactor Flow: Same-Layer Characterization Tests

Characterization tests go at the layer that covers the refactored code. Examples:

- Presentational component → component test
- Hook used across one or two components → component test (test through the component)
- Shared hook → `renderHook` test
- Data-fetching composition → integration (RTL + MSW)
- Multi-page flow → E2E (Playwright)

Write characterization tests FIRST (green against current behavior), then refactor, then tests stay green.

### Explicit Test-Coverage Requests

When the user says "add tests to X", write tests at whatever layer X lives in. The user's framing authorizes the layer.

### Test Folder Structure
Co-locate tests with code, following project convention:
```
src/features/product/
├── components/
│   ├── ProductCard.tsx
│   ├── ProductCard.test.tsx
│   └── __mothers__/
│       └── ProductMother.ts
├── hooks/
│   ├── useProduct.ts
│   └── useProduct.test.ts
└── __tests__/
    └── ProductPage.integration.test.tsx
```

## Phase 5: Verify and Clean Up

1. **Run the full test suite.** All pass.
2. **Run linter and type checker.** Fix violations.
3. **Check implementation checklist.** Read `references/implementation-checklist-frontend.md`.
4. **Tech debt report.** Resolved and new items.
5. **Clean code verification.** Guard clauses, single abstraction, meaningful names, no "what" comments.
6. **Report what was built.** Files, test coverage, deviations.

## Guidelines

**Mirror the codebase.** Reference implementation is your style guide.

**Framework-specific idioms.** App Router -> Server Components + `'use client'`. Pages Router -> `getServerSideProps`. Vite -> client-side. Never mix.

**No over-engineering.** Only write what the task requires.

**Refactoring is separate from feature work.** Never in the same slice.

## Reference Documentation

- [Testing Strategy Guide](references/testing-strategy-guide-frontend.md) — frontend-specific testing synthesis (Phase 2 dedupe candidate; not yet collapsed into KB headlines).
- [Implementation Checklist](references/implementation-checklist-frontend.md) — workflow scaffold; not a knowledge surface.
