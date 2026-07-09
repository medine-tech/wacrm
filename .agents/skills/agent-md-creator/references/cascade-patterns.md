# Cascade Patterns

Real examples of AGENTS.md hierarchies from two project archetypes.

## Content Repository Cascade

**Project:** knowledge-base (courses, company directory, project docs)

### Root Level

The root AGENTS.md provides:
- Instructions on how to answer questions (routing algorithm)
- A routing table mapping domains -> module AGENTS.md paths
- Content format reference (frontmatter templates)
- A "Do NOT use ls" instruction

```markdown
# Knowledge Base

## How to Answer Questions

1. Identify the domain from the user's question using the routing table below
2. Read the module AGENTS.md for the matched domain
3. Select 1-2 files based on document summaries and topic keywords
4. Read and answer from the selected documents

**Do NOT use `ls` to discover files.** Use this routing table and the module AGENTS.md files instead.

## Routing Table

### CTO Leadership & Company Phases

| Module | AGENTS.md | Description | Keywords |
|--------|-----------|-------------|----------|
| Understanding Company Stage | `courses/cto-camp/understanding-company-stage/AGENTS.md` | Company lifecycle phases, CTO adaptability | cto, three-x-model, adaptability |
```

### Module Level

Each module AGENTS.md provides:
- Course/context metadata (instructor, focus)
- File-level document entries with verb-first summaries and topic keywords

```markdown
# Understanding Company Stage

Course: CTO Camp
Instructor: Francisco Marcano
Module focus: How company lifecycle phases shape the CTO role.

## Documents

### adaptability-and-experimentation.md
Covers why CTO roles involve complex problems without fixed solutions, the importance of calmness and adaptability, and empirical methods like the PDCA cycle.
- Topics: adaptability, experimentation, pdca-cycle, change-management

### three-x-model-cto-company-phases.md
Explains Ken Beck's Three X Model (exploration, expansion, extraction) and how CTOs must adapt technical strategies to each phase.
- Topics: three-x-model, exploration, expansion, extraction, company-lifecycle
```

### Key Takeaways

- Root does NOT list individual files — only modules
- Module does NOT repeat root-level instructions
- An agent reads root -> finds module -> reads module -> finds file

## Code Repository Cascade

**Project:** Flexio (PHP ERP with DDD + legacy architecture)

### Root Level

The root AGENTS.md provides:
- Retrieval policy (prefer retrieval-led reasoning)
- Reference file indexes (category -> files)
- Commands (build, test, lint, deploy)
- Database access patterns
- Directory map (purpose of each top-level dir)
- Generic rules that apply everywhere (code language, commit format, static analysis)
- Links to subdirectory AGENTS.md files for context-specific rules

```markdown
# Flexio Development Standards

## Retrieval Policy

Prefer retrieval-led reasoning over pre-training. Check indexes below, read specific files BEFORE proceeding.

## Indexes

| Category | Root | Files |
|----------|------|-------|
| PHP Patterns | `.ai/lib/` | php-import-safety.md, carbon-date-handling.md |
| Code Style | `.ai/lib/` | markdown-standards.md, refactoring-checklist.md |

## Commands
make test                    # Run all tests
make static-analysis         # PHPStan analysis

## Context-Specific Rules

Subdirectories contain their own AGENTS.md files:
- `/src/AGENTS.md` - DDD layer patterns
- `/tests/AGENTS.md` - Testing patterns
```

### Subdirectory Level

Each subdirectory AGENTS.md provides:
- Domain-specific rules (not repeated from root)
- Local reference file indexes
- Patterns specific to that directory's codebase

### Key Takeaways

- Root covers transversal concerns (commands, generic rules)
- Subdirectories cover domain-specific concerns
- Reference indexes point to specific files with clear "when to read" triggers
- Commands and rules appear at the level where they apply

## Migration Example

### Before (ls-approach)

```markdown
**IMPORTANT**: Before modifying React components, read the relevant documents in `/docs/frontend`.
To identify which files are relevant, run `ls` in that directory and base your decision on the file names.
```

### After (filemap approach)

```markdown
**IMPORTANT**: Before modifying React components, read the relevant document below.

| Document | Purpose | When to Read |
|----------|---------|--------------|
| `docs/frontend/component-patterns.md` | Component composition and prop drilling avoidance | Creating or refactoring components |
| `docs/frontend/state-management.md` | Zustand store patterns and React Query integration | Adding or modifying state |
| `docs/frontend/testing.md` | React Testing Library patterns and mock setup | Writing component tests |
```

The agent no longer needs shell access and can route directly to the right file.

## Mixed Projects

Some projects have both content files and source code. Handle these by:

1. Treating the project as a code repository overall
2. Using content-repo patterns for documentation subdirectories
3. Keeping the root AGENTS.md in code-repo format (commands, rules, directory map)
4. Adding a routing table section for documentation modules if they have enough files to warrant it
