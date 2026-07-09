---
name: agent-md-creator
description: >-
  Create, update, migrate, and audit AGENTS.md files — the static indexes that
  give AI coding agents instant project context without running filesystem
  commands. Use this skill whenever the user wants to create an AGENTS.md for a
  directory, add new files to an existing AGENTS.md index, update document
  summaries, migrate old AGENTS.md files that tell the agent to "run ls" or
  "list the directory" into pre-built file indexes, audit AGENTS.md coverage
  across a project, or set up a cascade hierarchy for a new project. Also use
  when the user says "add to index", "update the docs map", "index this
  module", "create file index", or "set up AGENTS.md for this project".
license: MIT
metadata:
  author: medine-tech
  version: "1.0.0"
---

# AGENTS.md Creator

Create and maintain AGENTS.md files — static file indexes that replace filesystem discovery commands.

## Project Conventions

Before applying this skill, read the project's root `AGENTS.md` and any
`docs/*.md` files it indexes that are relevant to this task. Project-specific
conventions override this skill's generic defaults; when they conflict,
the project wins and the skill records the override in the output.

## Core Principle

An agent reading an AGENTS.md should know exactly which file to open for any question, without running `ls`, `find`, `tree`, or any other filesystem command. The AGENTS.md IS the filesystem map. Vercel's research shows that an 8KB static index achieves 100% task pass rate vs 53% baseline. The key insight: prefer retrieval-led reasoning over pre-training-led reasoning.

**Progressive disclosure** is the organizing principle. AGENTS.md files operate at three levels: (1) routing metadata — always in context, points to the right directory; (2) file index — loaded when entering a directory, maps questions to specific files; (3) file content — loaded on demand when the agent opens a referenced file. This matches how AI agent context works: static context costs tokens once per conversation but saves repeated tool-call costs, so a well-curated index pays for itself quickly. [Source: agentic-programming-foundations]

## Project Archetypes

Before creating any AGENTS.md, determine which archetype the project follows. Read 2-3 representative files in the target directory to decide.

### Content Repository

Files with YAML frontmatter (`type: lesson`, `type: directory-entry`, `type: documentation`). Knowledge bases, documentation sites, course collections.

**Cascade pattern**: Root routing table -> module AGENTS.md with document entries

**Example**: The knowledge-base project uses this pattern.

### Code Repository

Source code, configs, tests. Application codebases, libraries, services.

**Cascade pattern**: Root overview/commands/rules/directory-map -> subdirectory rules/reference indexes

**Example**: The Flexio project uses this pattern.

### Detection

Read 2-3 files in the target directory:
- YAML frontmatter with `type`, `domain`, `tags` fields -> content repository
- Source code files (.ts, .py, .php, etc.) or configs -> code repository
- Mix of both -> treat as code repository with content sections

## Workflows

### Create New AGENTS.md

1. **Detect archetype** — read 2-3 files in the target directory
2. **Scan the directory** — use Glob to find all relevant files (not `ls`)
3. **Read each file** — extract purpose, key topics, and summary-worthy details
4. **Select template** — read `references/templates.md` for the matching archetype template
5. **Generate AGENTS.md** — fill the template with specific, verb-first summaries
6. **Update parent** — if a parent AGENTS.md exists, add an entry pointing to the new file
7. **Validate** — run the validation checklist (see below)

### Update Existing AGENTS.md

1. **Read the existing AGENTS.md** — understand current structure and format
2. **Identify new/changed files** — compare AGENTS.md entries against actual files
3. **Read new files** — extract summaries for files not yet indexed
4. **Use Edit, not Write** — add new entries matching the existing format exactly
5. **Preserve existing entries** — never remove or rewrite entries that haven't changed
6. **Update parent if needed** — only if the module's scope description changed

### Migrate from ls-approach

Some older AGENTS.md files instruct the agent to "run ls in /docs/" or "list the directory to see available files." This is the anti-pattern this skill replaces.

1. **Detect ls instructions** — look for phrases like "run ls", "list the directory", "use find to discover", "check what files exist"
2. **Read the referenced directory** — Glob the files the ls would have found
3. **Read each file** — extract purpose and summary
4. **Replace the ls instruction** — substitute with a pre-built file index table
5. **Preserve all non-ls content** — keep rules, context, and other guidance intact

### Audit AGENTS.md Coverage

1. **Find all AGENTS.md files** — `Glob("**/AGENTS.md")` from project root
2. **For each AGENTS.md**, check:
   - Every file referenced in the index actually exists
   - Every content file in the directory has an entry in the index
   - No instructions to run `ls`, `find`, `tree`, or other discovery commands
   - Topics/keywords use kebab-case
   - Parent AGENTS.md has a routing entry for this module
3. **Report findings** — list missing entries, phantom references, and ls instructions
4. **Fix if requested** — apply Create or Update workflow to fill gaps

## Content Curation Strategy

Follow the **80% rule**: include in an AGENTS.md what agents need 80% of the time. Excess content wastes context tokens and dilutes attention. When unsure whether to include something, leave it out — you can add it later via the reactive method.

**Reactive observation method**: After deploying an AGENTS.md, notice when agents fail to find information or resort to filesystem commands. Each failure is a signal to add that content to the index. This builds the index organically toward maximum relevance with minimum bloat.

**What NOT to include**: Raw file contents (agents can read files on demand), implementation details that change frequently (stale indexes are worse than missing ones), and information that's obvious from file names alone.

**Symlink awareness**: When a project uses symlinks to share AGENTS.md files across directories (e.g., CLAUDE.md → AGENTS.md), both VS Code and Cursor may load the file twice if both the symlink and target are in scope. Note this risk in cascade hierarchies that use symlinks.

## Content Generation Rules

### Document Entries (Content Repos)

Each entry follows this exact format:

```markdown
### filename.md
Verb-first one-sentence summary describing what the file covers and when to read it.
- Topics: kebab-case, comma-separated, specific-keywords
```

Summaries must be specific — not "covers various topics about feedback" but "Explains the feedback sandwich myth, why public praise backfires, and how growth mindset affects receptivity to criticism."

### Root Routing Tables (Content Repos)

```markdown
| Module | AGENTS.md | Description | Keywords |
|--------|-----------|-------------|----------|
| Module Name | `path/to/module/AGENTS.md` | One-sentence scope | keyword-1, keyword-2 |
```

### File Index Tables (Code Repos)

```markdown
| Document | Purpose | When to Read |
|----------|---------|--------------|
| `filename.md` | What it covers | Trigger condition |
```

### General Rules

- Summaries start with a verb (Explains, Covers, Defines, Implements, Configures)
- Topics/keywords always use kebab-case
- Never include instructions to run `ls`, `find`, `tree`, or any discovery command
- No content duplication across cascade levels — each level adds unique information
- Reference files by relative path from the AGENTS.md location

## Cascade Hierarchy

AGENTS.md files form a hierarchy where each level serves a different purpose. Read `references/cascade-patterns.md` for detailed examples.

### Levels

- **Root**: Project overview, transversal content (commands, rules), navigation to subdirectories
- **Subdirectory**: Domain-specific content, file-level indexes, local rules
- **Deep subdirectory** (rare): Only for deeply nested projects with distinct sub-domains

### Precedence

Nearest-file-wins — a subdirectory AGENTS.md overrides root guidance for that domain. Root provides defaults; subdirectories specialize.

### Anti-patterns

- Duplicating the same rules at root and subdirectory levels
- Missing cascade links (root doesn't mention subdirectory AGENTS.md exists)
- Orphan AGENTS.md files with no parent reference

## CLAUDE.md Handling

AGENTS.md is the universal standard (works with 20+ AI tools). Only create CLAUDE.md copies alongside AGENTS.md if the project already uses CLAUDE.md files. In that case, keep them in sync — either as symlinks or identical copies.

When auditing, check if the project has both AGENTS.md and CLAUDE.md. If CLAUDE.md exists but AGENTS.md doesn't, offer to create AGENTS.md and set up sync.

## Validation Checklist

Run this after every create, update, or migrate operation:

- [ ] Every file referenced in the AGENTS.md actually exists on disk
- [ ] Every content file in the directory has an entry in the AGENTS.md
- [ ] No instructions to run `ls`, `find`, `tree`, or other filesystem discovery commands
- [ ] All topics/keywords use kebab-case
- [ ] Summaries are verb-first and specific (not generic)
- [ ] Parent AGENTS.md has a routing entry for this module (if applicable)
- [ ] No content duplicated between this AGENTS.md and its parent
- [ ] Cascade links work — parent points to child, child doesn't orphan

## Reference Documentation

- [Best Practices](references/best-practices.md) — Research-backed guidelines for effective AGENTS.md files
- [Cascade Patterns](references/cascade-patterns.md) — Hierarchy patterns with real project examples
- [Templates](references/templates.md) — Ready-to-use templates for all AGENTS.md types
