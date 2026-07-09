# Tactical DDD Lane

Eight ordered questions on tactical DDD concerns. Replaces the old "Data Model and Contracts" lane. Each question constrains the next — do not skip ahead.

Each question uses the "Propose > Inquire" rule: lead with a recommendation grounded in the codebase, then ask the user to confirm, tweak, or redirect.

**Skip rules:**
- Skip any question the codebase already unambiguously answers.
- **Pure-read fast-forward:** if Question 1 resolves to "None — pure read through an existing aggregate, no mutation," skip Questions 2, 3, 6, 8. Questions 4, 5, 7 still apply. Log `Tactical N/8 (pure read)` in the DDD Coverage footer.

Each skip is logged in the DDD Coverage footer with its reason.

## Question 1 — Aggregate identification

Which aggregate(s) does this feature touch? Is this a new aggregate or extension of an existing one? If extension, is growth horizontal (new related entity) or vertical (deeper nesting)?

**Default recommendation:** name the existing aggregate by its class/file. If extension, call out horizontal vs vertical explicitly — vertical growth is the warning sign (deep nesting drives method explosion and lazy-loading contamination). If this is a pure read with no mutation, answer "None — pure read" and trigger the pure-read fast-forward.

**KB anchors:**
- `courses/codely/software-design-and-architecture/domain-modeling/aggregates/aggregates-and-their-challenges.md`

## Question 2 — Aggregate size stress test

Will this push the aggregate past the "one mutation per request" rule, or force lazy loading of related entities inside the transaction?

**Default recommendation:** if yes, split now via relationship-by-identifier. Choose the consistency strategy for what was previously one-transaction: domain service for synchronous pre-condition validation, or domain event + subscriber for asynchronous derived state. Do not defer the split on the "we'll refactor later" promise — splits after a god-aggregate has grown cost 10× more.

**KB anchors:**
- `courses/codely/software-design-and-architecture/domain-modeling/aggregates/aggregate-refactoring-and-consistency.md`
- `courses/codely/software-design-and-architecture/domain-driven-design/ddd-faq-adoption-async-and-aggregates.md`

## Question 3 — Invariants and where enforced

What business rule must *always* be true on this aggregate after any mutation? Where is it enforced — VO constructor (single-field), aggregate root (cross-field), or domain service (external check)?

**Default recommendation:** enumerate the invariants first (even one-liners), then place each. Single-field rules (format, range, non-empty) belong in the VO constructor with guard clauses. Cross-field rules (if `A`, then `B` must also be set) belong in the aggregate root's `create`/mutator methods. Checks that require a second aggregate or an external system belong in a domain service injected into the use case.

**KB anchors:**
- `courses/codely/software-design-and-architecture/domain-modeling/aggregates/uuids-integrity-and-validation.md`
- `courses/codely/software-design-and-architecture/domain-modeling/value-objects/validation-guard-clauses-and-placement.md`

## Question 4 — Value object vs entity calls

For each new field or concept: is it an identity-bearing entity or a value-semantic VO?

**Default recommendation:** default to VO unless identity is required (you need to distinguish two equal-valued instances, or track changes over time, or reference it from outside the aggregate). Remember that VO↔entity is not forever — likes start as VOs and become entities when they gain behavior; addresses start as entities and become VOs when their lifecycle collapses into the owner's. Design for today's requirements, not a hypothetical future.

**KB anchors:**
- `courses/codely/software-design-and-architecture/domain-modeling/value-objects/value-objects-before-after-benefits.md`
- `courses/codely/software-design-and-architecture/domain-modeling/aggregates/conventions-and-vo-entity-modeling.md`

## Question 5 — Identifier strategy

Client-generated UUID (default, CQRS-compliant, idempotent) or server-generated (sequential for tax law, NanoID for URL-friendliness)?

**Default recommendation:** client-generated UUID. Enables idempotent retries, offline mode, CQRS void commands, and straightforward duplicate-event handling. Use server-generated sequential IDs only when a legal or business rule demands them (tax-compliant invoice numbers, gap-free audit sequences) — and wrap the server-generation in a transactional boundary. Use NanoID when the identifier must be URL-pretty.

**KB anchors:**
- `courses/codely/software-design-and-architecture/domain-modeling/aggregates/uuids-integrity-and-validation.md`
- `courses/codely/software-design-and-architecture/domain-modeling/aggregates/non-uuid-identifiers.md`

## Question 6 — Domain event set

What events does this aggregate record? For each event: name (past tense, context-prefixed), granularity (one per state change, not per method call), internal-only or public, payload shape (business data, never exception objects).

**Default recommendation:** enumerate each event with a past-tense, context-prefixed name (`StudentRegistered`, `CoursePublished`, `VideoCreated`). One event per state change — not one per method call, not a firehose per update. Distinguish internal (same BC) from public (subscribed by other BCs) up front so payload enrichment can be decided once. Payload is business data keyed by aggregate identity; exception objects and stack traces do not belong in payloads.

**KB anchors:**
- `courses/codely/software-design-and-architecture/domain-modeling/domain-events/event-naming-and-versioning.md`
- `courses/codely/software-design-and-architecture/domain-modeling/domain-events/event-granularity-and-semantics.md`
- `courses/codely/software-design-and-architecture/domain-modeling/domain-events/internal-external-events-and-enrichment.md`

## Question 7 — Repository and read-model shape

Does the read path need a projection, a materialized field, a SQL view, or a search-engine document? Is querying flexible enough that a Criteria/Specification pattern is warranted over method explosion?

**Default recommendation:** if the read is a single aggregate by ID, a plain repository is fine. If it's a listing with filters/sort/pagination, use the Criteria pattern as a shared-kernel domain class (filters, order, limit, offset) — it eliminates `findByXAndYOrderedByZ` method explosion and keeps infrastructure out of the domain. If the read crosses aggregates or BCs, materialize via event-driven projections rather than joining at read time. SQL views are a pragmatic first step that can later evolve into full materialized views + events.

**KB anchors:**
- `courses/codely/software-design-and-architecture/domain-modeling/aggregates/performance-and-criteria-pattern.md`
- `courses/codely/software-design-and-architecture/domain-modeling/projections/projections-overview.md`
- `courses/codely/software-design-and-architecture/domain-driven-design/data-denormalization-and-api-aggregation-strategies.md`

## Question 8 — Idempotency and saga / compensation

If this writes across aggregates or BCs: is every subscriber idempotent? If a later step can fail, is the rollback an implicit saga (failure event + compensating subscriber) or does it need explicit TCC (Try/Commit/Cancel)?

**Default recommendation:** idempotency is non-negotiable — implement via find-then-create (for aggregate creation) or track-contributing-IDs (for counter projections). For multi-step flows, default to **implicit sagas**: the failing use case publishes a domain failure event (`PaymentAuthorizationFailed`, not an exception), and a compensating subscriber runs the undo. Never compensate transient infrastructure errors — let retry/DLQ handle those. Only model compensations for steps where compensation is meaningful (you cannot un-send an email; do not add a no-op compensator just for symmetry). Append-only ledger semantics: compensations leave visible traces, never rewrite history.

**KB anchors:**
- `courses/codely/software-design-and-architecture/problems-with-ddd-domain-events/handling-duplicate-events-in-distributed-systems.md`
- `courses/codely/software-design-and-architecture/problems-with-ddd-domain-events/distributed-transactions-and-sagas.md`
