# AGENTS.md Templates

Ready-to-use templates for all AGENTS.md types. Replace placeholders in `<angle-brackets>`.

## 1. Content-Repository Root

For projects where content files have YAML frontmatter (knowledge bases, doc sites, course collections).

```markdown
# <Project Name>

<One-sentence project description.> Each category and module contains its own `AGENTS.md` with detailed summaries.

## How to Answer Questions

1. **Identify the domain** from the user's question using the routing table below
2. **Read the module AGENTS.md** for the matched domain to find relevant documents
3. **Select 1-2 files** based on document summaries and topic keywords
4. **Read and answer** from the selected documents, citing sources when helpful
5. If the question spans multiple domains, check AGENTS.md files in each relevant module

**Do NOT use `ls` to discover files.** Use this routing table and the module AGENTS.md files instead.

## Routing Table

### <Domain Group Name>

| Module | AGENTS.md | Description | Keywords |
|--------|-----------|-------------|----------|
| <Module Name> | `<path/to/module/AGENTS.md>` | <One-sentence scope> | <keyword-1, keyword-2, keyword-3> |
```

## 2. Content-Repository Module

For subdirectories in a content repository, each containing related content files.

```markdown
# <Module Title>

Course: <Course or Collection Name>
Instructor: <Author or Instructor Name>
Module focus: <One sentence describing the module's scope and what topics it covers.>

## Documents

### <filename>.md
<Verb-first one-sentence summary describing what the file covers and when to read it.>
- Topics: <kebab-case, comma-separated, specific-keywords>
```

Notes:
- The metadata fields (Course, Instructor) adapt to context — use Author for non-course content, omit Instructor for self-authored content
- Each document entry needs exactly one summary sentence and one Topics line
- Topics should overlap with the file's frontmatter `tags` but can include additional routing terms

## 3. Code-Repository Root

For source code projects (applications, libraries, services).

```markdown
# <Project Name>

<2-3 sentence project description covering what it does and key technology choices.>

## Retrieval Policy

Prefer retrieval-led reasoning over pre-training. Check indexes below, read specific files BEFORE proceeding.

## Commands

```bash
<command>    # <description>
<command>    # <description>
```

## Directory Map

- `<dir>/` — <purpose>
- `<dir>/` — <purpose>

## Rules

### <Rule Category>
<Rule description>

### <Rule Category> -> `<path/to/reference.md>`

## Reference Index

| Category | Path | Files |
|----------|------|-------|
| <Category> | `<dir>/` | file1.md, file2.md |

## Context-Specific Rules

Subdirectories contain their own AGENTS.md files with domain-specific guidance:
- `<path>/AGENTS.md` — <what it covers>
- `<path>/AGENTS.md` — <what it covers>
```

Notes:
- Commands go near the top — they're the most frequently needed information
- Rules that are short (1-2 lines) go inline; longer rules point to reference files
- The directory map replaces `tree` output with purpose annotations
- Context-Specific Rules section links to subdirectory AGENTS.md files

## 4. Code-Repository Subdirectory

For subdirectories within a code repository that need their own context.

```markdown
# <Directory/Domain Name>

<One-sentence description of this directory's role in the project.>

## Rules

<Domain-specific rules that don't apply project-wide. Don't repeat root-level rules.>

## Reference Documents

| Document | Purpose | When to Read |
|----------|---------|--------------|
| `<filename>` | <What it covers> | <Trigger condition — when should the agent read this?> |
```

Notes:
- Only include rules that are specific to this directory
- Reference documents table replaces "run ls" instructions
- "When to Read" column is the key differentiator — it tells agents exactly when to load the file

## 5. Empty Module Placeholder

For new modules that don't have content yet but need to be represented in the hierarchy.

```markdown
# <Module Title>

<Context about the module — what it will contain.>

## Documents

_No documents yet._
```

Use this when creating a module directory that will be populated later. It ensures the cascade link exists from the parent even before content is added.
