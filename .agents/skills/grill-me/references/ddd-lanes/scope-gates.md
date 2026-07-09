# Phase 1.5 Scope Gates

Three deterministic classifiers decide which lanes actually fire. They prevent DDD theater on work that does not warrant it, and they prevent the skill from insisting on aggregates for trivial or meta work.

Each gate records its decision in the DDD Coverage footer so you can see at a glance whether the gates fired correctly — signal for calibration over time.

## Gate 1 — Non-domain-work classifier

**Signal:** the change-set touches only paths from the exclusion list, with no paths in `domain/` / `application/` / `infrastructure/`, no new aggregates, no new events.

**Exclusion paths (any of):**
- `*.md` (documentation)
- `package.json`, `composer.json`, `pom.xml`, `build.gradle`, `requirements.txt` (dependency manifests)
- `*.config.*`, `tsconfig*.json`, `jest.config.*`, `vitest.config.*`, `vite.config.*`
- `tailwind.config.*`, `postcss.config.*`
- `.github/**`, `.gitlab-ci.*`, `Jenkinsfile`
- `.agents/**`, `.claude/**`
- `skills/**` (skill authoring)
- `**/settings.json` (Claude Code config), `**/CLAUDE.md`, `**/AGENTS.md`
- Agent-prompt and subagent definition files

**Effect when it fires:**
- Strategic DDD lane skipped
- Tactical DDD lane skipped
- Test Strategy DDD augmentation skipped
- Standard lanes (Problem & Scope, Core Logic, Test Strategy generic, and elevated lanes if risk is elevated) still run
- DDD Coverage footer reads: `DDD Coverage: lanes skipped — meta-tooling work`

**Why:** forcing "which aggregate owns this?" on a README edit, a Tailwind config tweak, or a skill authoring change is theater that trains the user to tune out the skill. The classifier is intentionally path-based rather than content-based to keep it deterministic.

## Gate 2 — Pure-read fast-forward

**Signal:** Tactical DDD Question 1 ("aggregate identification") resolves to "None — pure read through an existing aggregate, no mutation."

**Effect when it fires:**
- Tactical Questions 2 (aggregate size), 3 (invariants), 6 (domain events), 8 (idempotency/saga) skip — mutation-specific questions do not apply to read paths
- Tactical Questions 4 (VO/entity), 5 (identifier strategy), 7 (repository/read-model) still run — the read path has these concerns
- Strategic DDD lane runs normally (a pure read can still cross BCs)
- DDD Coverage footer reads: `Tactical 4/8 (pure read)` or whatever fraction of 4/5/7 fired

**Why:** insisting on a domain event or an idempotency pattern for a feature that makes no writes is nonsense. The fast-forward keeps the lane honest without making the user argue past four irrelevant questions.

## Gate 3 — Remediation blast-radius gate

**Signal:** Phase 1 flagged the codebase as non-DDD **and** the change is a localized bugfix — approximately ≤50 lines, 1–2 files, no new behavior, no new events, no new aggregates.

**Effect when it fires:**
- The `plan-ddd-wedge` dispatch at Phase 4 is **not** offered
- DDD Coverage footer reads: `Remediation skipped — localized fix below wedge threshold`

**Why:** the DDD remediation wedge is for *new behavior in legacy code* — a feature that deserves to be born DDD-shaped behind an ACL. A one-line bugfix to legacy code does not deserve a full ACL extraction, an outside-in ATDD suite, and a tech-debt ticket; proposing one is the shortest path to skill fatigue.

The 50-line / 2-file threshold is a heuristic, not a hard rule. Use judgment: if the fix is small but introduces a new method on a legacy class, that is still "new behavior" and the wedge may be worth offering. Log the reasoning in the footer so calibration signal is visible.

## Calibration signal

The DDD Coverage footer is the only telemetry. Over time, watch for:

- **Strategic 0/5 on most sessions** — signal that the non-domain gate is too loose or that the user is grilling mostly meta work. Adjust the exclusion list if the skill keeps skipping real domain work.
- **Tactical 8/8 on every session including trivial ones** — signal the gates are too tight; the skill is grilling pure reads as if they were mutations. Check the pure-read gate.
- **Remediation offered and always skipped by the user** — signal the blast-radius gate is too loose; widen the "localized bugfix" definition.
- **Remediation never offered in codebases you know are non-DDD** — Phase 1 DDD-signal detection is miscalibrated; check the signal rules.

No external sink, no dashboard — just read the footer.
