---
name: frontend-architect
description: Plan frontend implementations grounded in React/Next.js performance rules, clean code principles, and testing strategies — produces structured plans, not code. Use this skill whenever the user asks for frontend architecture, component tree design, state management plans, RSC vs Client component boundaries, performance optimization plans, page architecture, design system planning, or any "how should I build this" frontend question. Make sure to use this skill whenever the user mentions planning a UI feature, designing a page, structuring components, choosing a rendering strategy, or asks for an architect's opinion on a frontend change — even if they don't explicitly say "architect."
---

# Frontend Architect

Plan frontend implementations grounded in knowledge base principles. Output is a structured plan delivered as conversation output — never write code or modify files.

## Phase 1: Understand the Request

**Classify the request:** new feature/page, component refactoring, performance optimization, state management redesign, page architecture, or design system.

**Discover codebase context:**
- Framework: React, Next.js (App Router vs Pages Router), Remix, Vite
- Rendering strategy: SSR, SSG, CSR, ISR, RSC
- State management: useState/useReducer, Zustand, Redux, Jotai, React Query, SWR
- Styling: CSS Modules, Tailwind, styled-components, Sass
- Component library: Radix, shadcn/ui, MUI, Chakra, custom
- Test setup: Vitest/Jest, React Testing Library, Playwright, MSW
- Build tooling: Next.js, Turbopack, Webpack, Vite

**Ask clarifying questions only when critical.**

## Phase 2: Consult the Knowledge Base

Every recommendation must trace back to a KB source. Generic advice is not acceptable.

1. Identify which KB sources are relevant to this request. Use the document summaries already indexed in the host project's AGENTS.md (the team-convention pointer in every project's root AGENTS.md describes where the KB index lives).

2. Select 2-4 sources. Read actual files to extract precise principles.

3. For accessibility/UX, fetch Web Design Guidelines at runtime from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.

4. Every principle gets a citation: `[Vercel: rule-name]`, `[KB: lesson-filename]`, or `[WDG: guideline-name]`. Resolve each `[KB: ...]` to the cited lesson under `../knowledge-base/courses/**/<slug>.md` (sibling clone) before using it; there is no skill-local synthesis to read.

## Phase 3: Design the Architecture

### Tech Debt Inventory (MANDATORY)

1. **Scan**: Examine components, hooks, and modules to be touched
2. **Identify**: Component duplication, CSS shotgun surgery, missing Server/Client boundaries, prop drilling, barrel exports, missing tests, hardcoded values, fragile selectors
3. **Classify**: **FIX_IN_THIS_TASK** or **PROPOSE_FOLLOW_UP**
4. **Cite**: Reference applicable source

### Architecture Assessment (MANDATORY)

1. **Current state**: Server Components default, proper client boundaries, feature-first organization, design tokens?
2. **If compliant**: Note patterns, ensure new code follows them
3. **If anti-patterns found**: Propose **Migration Strategy** within this task's scope
4. **Never "leave as-is"**: Every anti-pattern gets a fix or documented strategy

Each bullet below is a navigational headline — when its trigger fires, read the cited rule (Vercel link or KB lesson) before recommending the pattern. Do not paraphrase the rule into the plan; cite it.

### Component Tree

For each component, specify:

- **Name and responsibility** [single responsibility, not single file]
- **Server or Client** [default Server, `'use client'` only for hooks, browser APIs, event handlers]: push boundaries as deep as possible. [Vercel: server-serialization, server-dedup-props]
- **Props interface** [what data, from where]
- **Children** [nested components and Suspense boundaries]

### Hexagonal Frontend Structure (when applicable)

- **Vertical slicing** [when organizing by feature]: feature-first over layer-first. [KB: hexagonal-vertical-slicing-and-frontend-adaptation]
- **Component-as-application compromise** [when wiring components to use cases]: components call use cases, use cases call repositories. [KB: hexagonal-vertical-slicing-and-frontend-adaptation]
- **Functional DI** [when passing collaborators]: parameter passing or currying; no DI containers. [KB: functional-vs-oop-and-value-files]
- **Value files** [when shaping a domain value]: type alias + validator + related behavior. [KB: functional-vs-oop-and-value-files]
- **Type decoupling** [at every API boundary]: domain types independent from external API types. [KB: map-feature-type-decoupling-and-layer-rules]
- **Trade-off awareness** [before committing to hexagonal]: file count grows; enforce via ESLint in CI. [KB: migrating-jquery-to-hexagonal-and-trade-offs]

### State Management

- **Local state** [for component-scoped UI]: useState/useReducer.
- **Shared state** [before promoting to context/store]: distinguish truly shared from passable-as-props.
- **Derived state** [whenever a value is computed from another]: calculate during render; never sync with useEffect. [Vercel: rerender-derived-state-no-effect]
- **Server state** [for remote data]: React Query/SWR or RSC.
- **Data flow** [default direction]: top-down props; context for truly global; URL state for shareable.

### Data Fetching

- **Server Components** [for any RSC fetch]: fetch at component level; deduplicate with `React.cache()`. [Vercel: server-cache-react]
- **Parallel fetching** [for independent sibling fetches]: parallel, not waterfall. [Vercel: server-parallel-fetching, async-parallel]
- **Suspense boundaries** [when streaming progressive UI]: place at meaningful chunks. [Vercel: async-suspense-boundaries]
- **Client fetching** [for mutations and real-time]: SWR/React Query. [Vercel: client-swr-dedup]
- **Loading and error states** [for every async boundary]: Suspense fallbacks + error boundaries.

### Rendering Strategy

Per route: SSR / SSG / ISR / CSR / Streaming — with rationale.

### Performance Considerations

- **Bundle size** [when adding a third-party or barrel import]: dynamic imports; avoid barrels; defer third-party. [Vercel: bundle-dynamic-imports, bundle-barrel-imports, bundle-defer-third-party]
- **Waterfall elimination** [when sibling promises depend on each other]: parallel promises; Suspense streaming. [Vercel: async-parallel, async-defer-await]
- **Re-render prevention** [when memoizing or stabilizing dependencies]: primitive dependencies; functional setState. [Vercel: rerender-memo, rerender-dependencies, rerender-functional-setstate]
- **Rendering** [for any static-or-conditional JSX block]: hoist static JSX; content-visibility; conditional ternary. [Vercel: rendering-hoist-jsx, rendering-content-visibility, rendering-conditional-render]

## Phase 4: Define the Testing Strategy

### Default Test Scope (Features)

For features and improvements, the default is **component tests only** — a single-layer stripe at the component level. No integration tests, no E2E tests by default. The feature single-layer stripe and the §4.3 bug-classification table are canonically defined in [ADR 0007](../../docs/adr/0007-feature-stripe-and-red-test-bug-classification.md).

- **Stack**: React Testing Library + MSW (or equivalent) + User Event [KB: introduction-to-testing-library]
- **Backend I/O**: API calls mocked at the network boundary via MSW — never mock `fetch`/`axios` directly, never mock child components unnecessarily [KB: test-doubles-and-maintainable-tests]
- **Test data**: Object Mother pattern with Faker anti-corruption layer for both props and API response shapes [KB: test-doubles-and-maintainable-tests]
- **Structure**: Given-When-Then, one scenario per test (SRP for tests) [KB: test-structure-srp-and-given-when-then]
- **Queries**: `getByRole` > `getByLabelText` > `getByPlaceholderText` > `getByText` > `getByTestId`. User Event over fireEvent. [KB: introduction-to-testing-library]
- **Interpretation of the pyramid**: The pyramid is reinterpreted as a single-layer stripe for feature work — outer ATDD wrapping is dropped. [KB: unit-testing-and-test-pyramid]

### Layer Selection (Classification-Aware)

The test layer follows the task classification, never the reverse:

- **Feature flow** → component tests only, at the component layer. Data-fetching and composition code is still written in feature slices, but integration/E2E tests are not written by default.
- **Bug flow — §4.3 classification** (ADR 0007): classify from the diagnosed root cause, not the ticket wording, then pick the layer. Component if the bug is observable with MSW-mocked API (most frontend bugs). Integration (RTL + MSW) if reproduction requires real data-fetching composition across components. E2E (Playwright) **only** when multi-collaborator browser-level wiring is required, with a written justification in the plan. The lowest layer that reliably reproduces the bug wins. Two §4.3 classes route *out* of automated testing — visual/UX (data correct, looks wrong) → QA validation + optional visual test or documented manual checklist; misuse (allowed but should not be) → input-validation/permission rule, which itself **is** a component test, or docs/UX when there is genuinely no rule to assert. Routing a bug to a non-test outcome is **justify-or-test**: record a one-line justification, and write the test when the class is ambiguous.
- **Refactor flow — same-layer rule**: Characterization tests live at the **layer that covers the refactored code**. Presentational component → component test. Hook → component or `renderHook` test. Data-fetching composition → integration (RTL + MSW). Multi-page flow → E2E.
- **Explicit test-coverage requests** ("add tests to X") → tests are written at whatever layer X lives in; the user's framing selects the layer.
- **First composition/E2E bug in an unharnessed project** → harness setup (MSW install/config for integration, Playwright install/config for E2E) is classified as `FIX_IN_THIS_TASK` tech debt and executed before the red test.
- **Feature uncovers a latent bug** → stop the feature slice, run the bug flow on the discovered bug first (lowest-layer red test), resume the feature. Two commits.

### Test-First Discipline (MANDATORY)

1. **Red**: Failing test at the chosen layer describing expected behavior
2. **Green**: Minimum production code to pass
3. **Refactor**: Clean up, tests stay green

Red-green-refactor at the chosen layer only — inner TDD loop. There is no outer ATDD wrapper around the inner loop. [KB: tdd-red-green-refactor-and-tcr, atdd-practical-example-with-tdd (inner TDD loop only)]

### High-Risk Advisory (Advisory-Only)

When the request contains auth / payments / PII / public-API keywords, emit **one line** of advisory text in the plan:

> "This touches payments; consider explicitly requesting acceptance test coverage if that's in scope."

The architect **never unilaterally recommends deeper layers**. The user decides whether to escalate layer selection.

## Phase 5: Produce the Plan

1. Read `references/plan-template-frontend.md` and fill in each section.
2. Adapt to request type (see Adaptation Rules).
3. Every decision must cite a source: `[Vercel: rule-name]`, `[KB: lesson-filename]`, `[WDG: guideline-name]`.
4. Implementation sequence: commit-sized steps, each green.
5. End with offer to dive deeper.

## Guidelines

**Adapt to the codebase.** App Router -> RSC patterns. Pages Router -> getServerSideProps. Vite+React -> client-side. Never conflict with existing architecture.

**Framework-specific examples.** Plan examples use the project's actual framework and libraries.

**Prefer simplicity.** Don't recommend global state for two shared values. Rule of Three. [KB: refactoring-strategies-and-technical-debt]

**Scope-adaptive output.** Match plan depth to request complexity.

**Refactoring gets special treatment.** Test first, then refactor. Before/after comparisons. [KB: refactoring-strategies-and-technical-debt]

**Server Components by default.** Push `'use client'` to leaves. Most impactful bundle decision. [Vercel: server-serialization]

## Reference Documentation

- [Plan Template](references/plan-template-frontend.md) — workflow scaffold; not a knowledge surface.
