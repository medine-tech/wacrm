# Feedback Guide

Principles for delivering code review findings, grounded in the knowledge base feedback modules. Every finding should follow these rules.

---

## Observations, Not Judgments

Describe what the code does before saying what it should do. State observable facts — what you see in the code — before applying a principle.

- **Do:** "The `enroll` method reads `course.students.length` and compares it to `course.maxCapacity` before adding the student."
- **Don't:** "The code violates encapsulation."

The observation gives the author context. The judgment alone triggers defensiveness.

[KB: effective-objective-feedback-techniques]

## Specific Over General

Reference exact locations, method names, and line numbers. Vague feedback ("the code has issues") forces the author to guess what you mean and creates ambiguity.

- **Do:** "In `StudentEnroller.ts:24`, the capacity check accesses `course.students` directly rather than asking the `Course` entity if it has capacity."
- **Don't:** "There are encapsulation problems in the enrollment feature."

[KB: effective-feedback-strategies-and-challenges]

## No Feedback Sandwich

Don't wrap findings between positive observations to soften them. The sandwich pattern (positive-negative-positive) causes anxiety — the author learns to brace for criticism after every compliment. Instead, separate positive observations into their own section at the top of the review.

[KB: common-feedback-mistakes-and-alternatives]

## Growth Mindset Language

Frame findings as patterns that can be improved, not as labels about the code or its author. Avoid fixed-trait language ("this is bad code", "this is a god class") that implies the issue is inherent rather than changeable.

- **Do:** "This component currently handles data fetching, state management, and rendering — extracting these into separate components would give each one a single responsibility."
- **Don't:** "This is a god component."

[KB: common-feedback-mistakes-and-alternatives]

## Relative, Not Absolute Language

Use comparative framing over absolute statements. "More than usual", "compared to other services in this codebase" is more accurate and less confrontational than "too many", "wrong", or "bad".

- **Do:** "This use case has more responsibilities than other use cases in this codebase."
- **Don't:** "This use case violates SRP."

[KB: effective-objective-feedback-techniques]

## Positive Observations Are Genuine

Acknowledge what the code does well — good patterns, clean naming, effective testing, proper invariant enforcement. These are not filler to offset findings. If the code handles state transitions correctly, say so specifically. If there's nothing genuinely positive, don't fabricate it — but there almost always is.

---

## Finding Format

Every finding follows this structure:

```
### [Severity] Finding Title

**Location:** `file:line` or `file:method`
**Observation:** What the code currently does (factual description).
**Principle:** The KB or Vercel principle that applies. [KB: lesson-filename] or [Vercel: rule-filename]
**Recommendation:** What to change and why.
```

## Severity Levels

| Severity | Criteria | Examples |
|----------|----------|---------|
| **Critical** | Breaks correctness, loses data, security issue, missing invariant enforcement | Missing capacity check allows over-enrollment; unvalidated user input reaches the database |
| **Major** | Violates core architecture principle, will cause maintenance pain at scale | Tell-Don't-Ask violation exposing internal state; entire page as `'use client'`; untested critical path |
| **Minor** | Naming convention, style issue, suboptimal but functional pattern | Verb-first use case naming; missing boolean prefix; "what" comments instead of "why" |
| **Suggestion** | Nice-to-have improvement, alternative approach worth considering | Could use Object Mother for test data; could parallelize independent fetches |

---

## Verdict

Every review ends with an explicit verdict that summarizes the overall assessment.

### Verdict Criteria

| Verdict | Criteria |
|---------|----------|
| **APPROVE** | No Critical or Major findings. Minor and Suggestion findings only. |
| **COMMENT** | No Critical findings. One or more Major findings that are debatable or context-dependent. |
| **REQUEST_CHANGES** | One or more Critical findings, OR multiple Major findings with clear fixes. |

### Placement

The verdict appears at the top of the Review Summary section, immediately after the brief overview line:

```
## Review Summary

Brief overview: what was reviewed, code type, overall assessment.

**Verdict: REQUEST_CHANGES**
```

For PR reviews, the verdict maps directly to the GitHub PR review action (`gh pr review --approve`, `--comment`, or `--request-changes`).

---

## Scope Calibration

Adjust review depth based on the diff size and change type. This prevents over-reviewing trivial changes and under-reviewing complex features.

### Diff-Size Thresholds

| Diff Size | Depth |
|-----------|-------|
| **Small (< 50 lines)** | Focus findings only on the changed code. Don't review the whole file. |
| **Medium (50-300 lines)** | Assess changed files in context of their module. Read neighboring files to understand conventions. |
| **Large (> 300 lines)** | Full rubric assessment. Check cross-file consistency and architecture alignment. |

### Type-Specific Adjustments

| Change Type | Adjustment |
|-------------|------------|
| **Test-only** | Skip code quality assessment. Focus entirely on test quality (Phase 4). |
| **Config / infrastructure** | Focus on Infrastructure checklist and security. Skip domain modeling sections. |
| **Refactoring (no behavior change)** | Verify tests stay green. Focus on Refactoring checklist. Lower severity for minor style deviations. |
| **New feature** | Full rubric. Extra attention to missing test coverage, domain modeling, and error handling. |
