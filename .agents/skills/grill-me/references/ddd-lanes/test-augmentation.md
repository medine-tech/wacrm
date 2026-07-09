# Test Strategy Lane — DDD Augmentation

The existing Test Strategy lane asks generic test-level questions (acceptance / integration / unit — what fits?). These six DDD-specific defaults fire on top when the feature touches domain code.

Each default uses the "Propose > Inquire" rule: lead with a recommendation, let the user confirm or tweak.

**Skip rules:**
- Defaults 3, 4, 5 skip when the feature introduces no new domain events and no new aggregates (e.g., pure read-model tweak, config change).
- Default 6 is a reminder, not a question — no skip logic.

## Default 1 — Outside-in ATDD entry point

Write the acceptance test first, at the controller, in ubiquitous language.

**Default recommendation:** one happy-path acceptance test plus one representative unhappy path per primary use case. Field-level validation combinatorics stay in unit tests — do not build a combinatorial matrix at the acceptance layer. The ATDD test pins the contract the implementation must satisfy; it is the outside-in anchor.

**KB anchors:**
- `courses/codely/software-design-and-architecture/domain-driven-design/outside-in-development-and-ubiquitous-language.md`
- `courses/codely/software-design-and-architecture/problems-with-ddd-domain-events/testing-strategy-for-distributed-event-driven-systems.md`

## Default 2 — Subscriber-as-entry-point unit tests

For every derived use case, the unit test enters at the *subscriber*, not the use case.

**Default recommendation:** the subscriber's unpacking of `DomainEvent` fields into use-case arguments is real behavior that would otherwise be untested. Instantiating a subscriber costs nothing (no framework request, no HTTP server), so there is no performance reason to enter at the use case. Do **not** write acceptance tests for subscribers — event-consumer error handling is generic (retry + DLQ) and is tested once at the event-bus integration level, not re-tested per subscriber.

**KB anchor:** `courses/codely/software-design-and-architecture/problems-with-ddd-domain-events/testing-strategy-for-distributed-event-driven-systems.md`.

## Default 3 — Event-bus integration test (the linchpin)

One integration test of the concrete event-bus class (e.g., `RabbitMqEventBus`) pulled from the DI container as the concrete type, pointed at a real test-environment broker.

**Default recommendation:** four variants cover the full surface:

1. **Publish-and-consume happy path** — Object Mother for random events, spy subscriber flipping `hasBeenExecuted`, wrap in an `eventually()` helper (while + try/catch + sleep, 5 attempts × 1s, upgradeable to exponential backoff).
2. **Retry path** — flaky subscriber throws once then succeeds; assert the event transits the retry queue and executes twice.
3. **DLQ path** — always-throwing subscriber lands the event in the dead-letter queue after the configured retry count.
4. **Outbox failover** — simulate an AMQP exception, assert the publisher falls through to `MysqlEventBus` and the relay republishes when the broker recovers.

Only required when the feature introduces or depends on domain events.

**KB anchors:**
- `courses/codely/software-design-and-architecture/problems-with-ddd-domain-events/testing-strategy-for-distributed-event-driven-systems.md`
- `courses/codely/software-design-and-architecture/problems-with-ddd-domain-events/eventual-consistency-in-event-driven-systems.md`

## Default 4 — Object Mother coverage

One Object Mother per new VO and aggregate, using Faker behind an anti-corruption layer.

**Default recommendation:** static `create` methods with partial parameters (defaults for everything not specified). Faker is wrapped so the test suite can swap it out without touching every Mother. Forbidden: inline test data that duplicates construction logic — it defeats the point of VOs as logic magnets.

**KB anchors:**
- `courses/codely/software-design-and-architecture/domain-modeling/value-objects/testing-with-object-mothers.md`
- `courses/codely/software-design-and-architecture/domain-modeling/aggregates/domain-events-and-aggregate-testing.md`

## Default 5 — Aggregate-comparison matcher

When asserting aggregate state in tests, use a matcher that strips domain events before deep-equal.

**Default recommendation:** events live only on production aggregates (built via `create()`, which records events) — never on Object-Mother-built aggregates (which use `new` or `fromPrimitives` for hydration). A naive deep-equal fails because the events list differs. The matcher (e.g., `AggregateRootSimilarComparator`) clones both sides, strips events, and compares the rest via reflection. Works for any `AggregateRoot` subclass.

Forbidden: asserting `toPrimitives()` equality that includes events.

**KB anchor:** `courses/codely/software-design-and-architecture/domain-modeling/aggregates/domain-events-and-aggregate-testing.md`.

## Default 6 — Golden user-journey tests (out of scope)

E-commerce-style "must-work" user journey tests (hourly against preprod/prod, often owned by client teams) are **not** in scope for grill-me.

**Default stance:** flag them as known-out-of-scope so the user does not re-raise them mid-grill. They live outside CI and are the client team's responsibility. Grill-me's test coverage ends at the CI boundary: outside-in ATDD + subscriber unit + event-bus integration + Object Mothers + aggregate matcher.

**KB anchor:** `courses/codely/software-design-and-architecture/problems-with-ddd-domain-events/testing-strategy-for-distributed-event-driven-systems.md` (golden-suite section).
