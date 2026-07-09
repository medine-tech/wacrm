# PRD Template

Linear-ready PRD template. Sections are tagged by inclusion level to support adaptive depth:
- **[required]**: Always included, regardless of feature size
- **[recommended]**: Included for medium features (1-3 weeks) and above
- **[large-only]**: Included only for large features (3+ weeks, 5+ slices)

When filling this template, replace placeholder text with concrete content. Remove section tags from the final output. If a section has nothing meaningful to add, omit it rather than filling it with boilerplate.

---

## {Feature Name}

### Problem [required]

What problem does this solve? For whom? What happens if we do not solve it? Write concrete impact, not abstract value statements. Include direct quotes from user feedback if available.

### Outcome [required]

What does the system look like when this is done? Describe observable behavior, not implementation. A person who has never seen the codebase should understand what changes.

### Appetite [required]

Time budget for this feature. This is a constraint, not an estimate.

> We are giving this {N weeks}. If it cannot ship in {N weeks}, we descope.

### Non-Goals [required]

What is explicitly out of scope for this iteration. Be specific. These prevent scope creep and give implementing agents clear boundaries.

- {Thing we are NOT doing}
- {Rabbit hole to avoid}

### Requirements [required]

Concrete, verifiable behaviors. No "As a user..." stories. State what the system does.

- [ ] {Requirement 1}
- [ ] {Requirement 2}
- [ ] {Requirement 3}

### State Coverage [required]

How the feature behaves in each state. Forces thinking beyond the happy path.

| State | Behavior |
|-------|----------|
| Happy path | {Normal successful flow} |
| Empty state | {No data exists yet} |
| Loading | {While fetching or processing} |
| Error | {Failure, timeout, or validation error} |
| Edge cases | {Boundary conditions, concurrent access, partial data} |

### Data Model / Contracts [recommended]

Key entities, schemas, or API shapes that change. Only what is decided. Leave implementation flexibility for the architect.

- **Affected models/tables**: {e.g., `User`, `Subscription`}
- **API changes**: {New endpoints, modified responses}
- **Schema changes**: {New fields, migrations}

### Rabbit Holes [recommended]

Known complexity traps. Things that look simple but are not, or tempting tangents that will blow the appetite.

- {Rabbit hole 1: why it's deceptively complex}
- {Rabbit hole 2: why this tangent is not worth pursuing now}

### Risks [recommended]

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| {Risk 1} | Low/Med/High | Low/Med/High | {How to mitigate} |

### Security & Privacy [large-only]

- **Authorization**: {Who can access what}
- **Sensitive data**: {PII, credentials, tokens}
- **Audit/logging**: {What needs to be tracked}

### Observability [large-only]

- **Feature flag**: `{flag_name}`
- **Key metrics**: {What to measure}
- **Alerts**: {What triggers a page}
- **Dashboard**: {Where to monitor}

### Migration [large-only]

If this changes existing data or behavior:

- **Backward compatibility**: {Can old and new coexist?}
- **Data migration**: {What data needs transformation}
- **Rollback plan**: {How to revert if things go wrong}
- **Point of no return**: {Is there one? When?}

### Implementation Slices [required]

Vertical slices ordered by dependency. Each slice cuts through all layers (UI, API, domain, persistence) and is independently testable. The `prd-to-issues` skill turns these into Linear sub-issues; this section is the input it consumes.

1. **Slice 1: {name}** -- {what it delivers end-to-end}
   - [ ] {Acceptance criterion}
   - [ ] {Acceptance criterion}

2. **Slice 2: {name}** -- {what it delivers} (blocked by Slice 1)
   - [ ] {Acceptance criterion}
   - [ ] {Acceptance criterion}

3. **Slice 3: {name}** -- {what it delivers}
   - [ ] {Acceptance criterion}

### Open Questions [required]

Unresolved items. Mark explicitly so implementing agents do not silently resolve them.

- [ ] [OPEN] {Question 1}
- [ ] [OPEN] {Question 2}

If all questions are resolved, write: "None -- all decisions confirmed."
