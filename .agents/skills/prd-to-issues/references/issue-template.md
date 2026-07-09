# Issue Description Template

Template for individual implementation issues decomposed from a PRD. Each issue is a vertical slice that cuts through all layers end-to-end.

## Template

```markdown
## Context
{1-2 sentences: what this slice delivers and why it matters in the broader feature.}
Parent PRD: {ISSUE-ID}

## What to Build
{End-to-end behavior description. What the system does when this slice is complete.
Include all layers touched: UI changes, API endpoints, domain logic, persistence.
Use the codebase's ubiquitous language -- exact class names, method names, route paths.}

## Acceptance Criteria
- [ ] Given {precondition}, when {action}, then {observable result} (happy path)
- [ ] Given {precondition}, when {action}, then {observable result} (error state)
- [ ] Given {precondition}, when {action}, then {observable result} (empty/loading)
- [ ] {Additional criteria as needed}

## Technical Checklist
- [ ] {Concrete step -- e.g., "Add `status` column to `enrollments` table"}
- [ ] {Next step -- e.g., "Create `EnrollStudentService` in `src/enrollment/application/`"}
- [ ] {Test step -- e.g., "Write acceptance test for enrollment happy path"}

## Out of Scope
- {What this issue explicitly does NOT do}
- {Which neighboring slice handles the adjacent behavior}

## Test Notes
- Unit: {What to unit test -- domain logic, value objects, services}
- Integration: {What to integration test -- repository adapters, external services}
- Acceptance: {What end-to-end behavior to verify}
```

## Filling Guidelines

**Context**: Reference the parent PRD by issue ID. Keep to 1-2 sentences. The implementing agent reads this first to orient itself.

**What to Build**: Be specific about all layers. If the slice adds an API endpoint, name the route, method, and request/response shape. If it adds a UI component, name the component and where it renders. Use codebase terms discovered during codebase exploration.

**Acceptance Criteria**: Use Given/When/Then format. Every slice covers at minimum:
- One happy path scenario
- One error scenario (validation failure, not found, conflict)
- Loading or empty state if the slice has UI

**Technical Checklist**: Ordered implementation steps. These tell the implementing agent what to build and in what order. Interleave test steps with production code steps -- test first, then implementation.

**Out of Scope**: Critical for context isolation. Prevents implementing agents from building what belongs to another slice. Reference the neighboring slice by name.

**Test Notes**: Brief guidance on test levels. The implementing agent (do-task) enforces its own testing discipline, but these notes point it in the right direction.
