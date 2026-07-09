# ADR Gate Doctrine

**Note:** This file is a copy. The authoritative version lives in the `create-adr` skill at `skills/create-adr/references/adr-gate-doctrine.md`. If the two drift, `create-adr` wins — sync this copy during grill-me version bumps.

The definition of what qualifies as an Architectural Decision Record in this ecosystem. The `create-adr` skill and any skill that dispatches to it (e.g., `grill-me`) must apply this gate before creating or proposing an ADR.

## What Qualifies

An ADR captures decisions that are **simultaneously**:

1. **Hard to reverse.** Undoing the decision costs weeks, breaks downstream contracts, or requires coordinated migration. Easily reversible choices (variable names, file layouts, internal helper shape) do not qualify.
2. **Surprising without context.** A new contributor reading the code could not infer *why* this choice was made from the code itself. The decision encodes trade-offs that are invisible after the fact.
3. **A real trade-off.** At least one credible alternative was considered and rejected for reasons that matter. A decision with no losing alternative is a pattern, not a decision.

All three must hold. Two out of three is not enough — it is the pattern-codification path and belongs in `create-doc` instead.

## Concrete Categories

Decisions that typically qualify when the three conditions above hold:

1. **Choice of a framework, library, or external service** when an alternative was seriously considered (e.g., "Drizzle over Prisma because…").
2. **Introduction or removal of a structural boundary** — a new bounded context, a service split, a module extraction, a hexagonal-ports adoption.
3. **Data-model commitments that shape future migrations** — event sourcing vs. state storage, multi-tenancy strategy, soft-delete policy, tenancy key placement.
4. **Security or compliance posture** — authentication mechanism, PII handling strategy, audit-log granularity.
5. **Concurrency or consistency model** — optimistic vs. pessimistic locking, eventual consistency acceptance, idempotency strategy for a given flow.
6. **Cross-cutting protocols** — API style (REST vs. GraphQL vs. RPC), error-shape contract, pagination strategy, versioning policy.
7. **Operational commitments with long tails** — deployment topology, rollout strategy for a risky subsystem, observability backbone (Sentry vs. Datadog, etc.).

## What Does NOT Qualify

These are patterns or conventions — route them to `create-doc`:

- **Coding conventions** ("value objects are immutable", "repositories expose `findById`", "React hooks go at the top of the component"). These are how the team writes code, not decisions with losing alternatives.
- **Style and formatting rules**. Prettier config, lint rules, naming conventions.
- **Repeatable patterns** (CRUD handler layout, DTO mapping shape). They codify practice rather than resolve a trade-off.
- **Implementation details that are trivially reversible.** A function rename, a refactor of a single file, an internal abstraction swap.
- **Preferences without a rejected alternative.** If nobody seriously proposed anything else, there is no decision to record.

A useful mental test: *"If I picked the losing alternative instead, would the system look meaningfully different six months from now, and would that difference be expensive to undo?"* If yes, ADR. If no, pattern.

## Edge Cases

- **The decision is hard to reverse but obvious in retrospect.** It is still an ADR if a reader would not guess the reasoning from the code alone. The value is preserving the "why", especially when the obvious choice had non-obvious alternatives considered.
- **The decision is surprising but easy to reverse.** Not an ADR — a comment or a `create-doc` convention captures the reasoning without the ceremony.
- **The decision is a pattern today but may become a boundary later.** Record it as `create-doc` now. Promote to an ADR the day the boundary commitment is actually made.
- **The decision was already made implicitly, in code, months ago.** Retroactive ADRs are allowed and useful. Date them with the current date and mention the commit or approximate date of the original choice in the body.

## When the Gate Is Ambiguous

If you cannot clearly classify, err toward `create-doc`. Over-creating ADRs pollutes the record with low-signal entries; under-creating them only delays formalization of a real trade-off. An easily-reversible wrong call is cheaper than a noisy ADR log.
