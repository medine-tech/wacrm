# AGENTS.md Best Practices

Compiled from research by Vercel, GitHub (2,500+ repos), Builder.io, and the agents.md specification.

## Static Indexes Over Dynamic Discovery

The single most impactful practice. Vercel's evals show that an 8KB pre-built file index achieves 100% task pass rate, compared to 53% when agents must discover files themselves. The agent wastes tokens and makes mistakes navigating unfamiliar directory structures.

**Do this:**
```markdown
## Documents

### authentication.md
Implements JWT-based auth flow with refresh token rotation.
- Topics: jwt, refresh-tokens, session-management

### rate-limiting.md
Configures per-endpoint rate limits using Redis sliding window.
- Topics: rate-limiting, redis, api-protection
```

**Not this:**
```markdown
## Documents

Run `ls docs/` to see available documentation files.
Read the relevant file based on the filename.
```

## Retrieval-Led Reasoning

"Prefer retrieval-led reasoning over pre-training-led reasoning" — agents should look things up in project files rather than guessing from training data. AGENTS.md makes retrieval fast by telling the agent exactly where to look.

This means summaries must be specific enough to differentiate files. Generic summaries like "covers authentication topics" force the agent to open the file anyway, defeating the purpose.

## Specificity Over Vagueness

Every summary should answer: "When should an agent read this file?"

**Specific (good):** "Explains why the feedback sandwich fails, how public praise backfires in collectivist cultures, and three alternatives for delivering critical feedback."

**Vague (bad):** "Contains information about feedback techniques and best practices."

The specific version lets an agent decide without reading the file. The vague version forces the agent to read it regardless.

## Six Core Areas for Code Repos

GitHub's analysis of 2,500+ repos found six areas that consistently improve agent performance:

1. **Commands** — Build, test, lint, deploy commands prominently at the top
2. **Testing** — How to run tests, naming conventions, fixture patterns
3. **Project Structure** — Directory map with purpose annotations
4. **Code Style** — Naming conventions, import ordering, formatting rules
5. **Git Workflow** — Branch naming, commit format, PR conventions
6. **Boundaries** — What the agent should Always do, Ask First about, and Never do

## Three-Tier Boundaries (Code Repos)

Effective code-repo AGENTS.md files define explicit boundaries:

- **Always**: Actions the agent should take without asking (run linter, use strict types)
- **Ask First**: Actions requiring confirmation (database migrations, API changes)
- **Never**: Prohibited actions (force push, delete branches, modify auth)

## Anti-Patterns

### "Run ls" Instructions
The most common anti-pattern. Telling agents to run filesystem commands wastes tokens, introduces errors from parsing output, and fails when the agent doesn't have shell access.

### Generic Summaries
"This file contains useful information about the project" — no agent can route to the right file with this. Summaries must differentiate.

### Duplicated Content Across Levels
Repeating the same rules in root and subdirectory AGENTS.md. Root provides defaults; subdirectories specialize. Duplication wastes context window and creates maintenance burden.

### Missing Cascade Links
A root AGENTS.md that doesn't mention subdirectory AGENTS.md files exist. The agent never discovers the more specific guidance.

### Stale Indexes
Referencing files that no longer exist, or missing files that were added after the index was created. Regular audits prevent this.

## Sizing Guidelines

- Root AGENTS.md: 100-300 lines for most projects, up to 500 for complex ones
- Module/subdirectory AGENTS.md: 20-100 lines typically
- Total AGENTS.md content per project: aim for under 8KB of core content (indexes, rules)
- Deep nesting (3+ levels) is rarely needed — flatten when possible
