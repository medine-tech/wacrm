# Strategic DDD Lane

Five ordered questions on strategic DDD concerns. Strategic decisions constrain tactical ones — do not skip into aggregate shape before the bounded context is pinned.

Each question uses the "Propose > Inquire" rule from the main SKILL.md: lead with a recommendation grounded in the codebase, then ask the user to confirm, tweak, or redirect.

**Skip rule:** skip any question the codebase already unambiguously answers. For example, if the feature is clearly inside an established bounded context with no cross-context reads, skip questions 3–5.

Each skip is logged in the DDD Coverage footer with its reason (codebase-answers, user-skipped, no-KB-anchor).

## Question 1 — Bounded context placement

Which existing bounded context owns this feature? If none fits, is this a new bounded context or an orbiting module inside an existing one?

**Default recommendation:** walk the context map found in Phase 1 (or `PRODUCT.md` if present) and name the best-fitting BC. If no fit, recommend an orbiting module inside the closest BC — promotion to a full BC should be driven by team formation, not by speculative anticipation.

**KB anchors:**
- `courses/codely/software-design-and-architecture/domain-driven-design/defining-bounded-contexts-and-modular-architecture.md`
- `courses/codely/software-design-and-architecture/domain-driven-design/promoting-modules-to-bounded-contexts.md`

## Question 2 — Ubiquitous language check

What are the 2–3 core terms this feature introduces or touches? Do any collide with a different meaning in another BC?

**Default recommendation:** surface the terms explicitly. If a term reuses a word that means something else in another BC, flag it as a collision and propose either a BC-specific prefix, a synonym, or a translation at the ACL boundary. Dispatch candidates to `ubiquitous-language` at Phase 4.

**KB anchors:**
- `courses/codely/software-design-and-architecture/domain-driven-design/outside-in-development-and-ubiquitous-language.md`
- User's own `PRODUCT.md` convention (produced by the `ubiquitous-language` skill).

## Question 3 — Cross-context communication style

Does this feature need data or behavior from another BC? If yes, pick one communication style.

**Default recommendation:** **domain event + local projection**, unless the read must be strongly consistent (e.g., payment authorization, tax compliance). Rationale: removes runtime coupling (the producer's outage does not take out the consumer) and team coupling (no Jira-ticket-that-never-ships for an endpoint the producer team owns only for the consumer's feature). Fall back to query bus + DTO if the data must be fresh on every read and the staleness tolerance is effectively zero.

Alternatives on the table: sync HTTP (simplest, worst coupling), query bus + DTO (strongly consistent, keeps runtime coupling), shared kernel VO (only for value-semantic, stable primitives like `VideoId`), ACL over legacy (when the source is outside the DDD perimeter).

**KB anchors:**
- `courses/codely/software-design-and-architecture/domain-driven-design/event-driven-cross-module-data-materialization.md`
- `courses/codely/software-design-and-architecture/domain-driven-design/sharing-code-between-bounded-contexts.md`
- `courses/codely/software-design-and-architecture/domain-driven-design/eventual-consistency-in-event-driven-systems.md`

## Question 4 — Eventual-consistency tolerance window

If event-driven, what's the acceptable staleness window from the user's POV — ms / seconds / minutes / "end-of-day"?

**Default recommendation:** seconds is the common web-app tolerance and the cheapest to defend. Anything tighter than seconds likely means either (a) the staleness is actually the producer's write latency and users won't perceive it as "stale", or (b) you need a sync read path instead of events. Tolerance drives autoscaling budgets, DB capacity decisions, and whether a transactional outbox is mandatory.

**KB anchors:**
- `courses/codely/software-design-and-architecture/problems-with-ddd-domain-events/eventual-consistency-in-event-driven-systems.md`
- `courses/codely/software-design-and-architecture/problems-with-ddd-domain-events/managing-saturated-event-queues.md`

## Question 5 — Team coupling check

Does shipping this feature require another team to build or maintain an endpoint, subscriber, or schema exclusively for us?

**Default recommendation:** if yes, flag it as the Jira-ticket-that-never-ships anti-pattern — another team's roadmap becomes your dependency. Prefer the event-driven redesign (subscribe to events the producer already publishes or would plausibly publish for their own reasons) over asking them to build a consumer-specific endpoint. If the producer has to add an endpoint purely for you, that is a strong signal the feature is in the wrong BC or the context-map relationship needs renegotiation.

**KB anchors:**
- `courses/codely/software-design-and-architecture/problems-with-ddd-domain-events/eventual-consistency-in-event-driven-systems.md` (Hystrix and team-coupling section)
- `courses/codely/software-design-and-architecture/domain-driven-design/ddd-faq-event-handling-bounded-contexts-and-validation.md` (Conway's Law note)
