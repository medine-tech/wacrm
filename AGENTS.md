<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Vendored agent skills are read-only

`.agents/skills/` holds skills copied verbatim from `medine-tech/knowledge-base`
and pinned by `computedHash` in `skills-lock.json`. `.claude/skills/` symlinks
into it, so each skill has exactly one source of truth in this repo.

Never hand-edit anything under `.agents/skills/` or `.claude/skills/`, and do not
propose edits to those paths in code review. A local edit forks the skill for
this repo alone, diverges from the lockfile pin, and is overwritten by the next
`npx skills update`. Fix the skill upstream in `medine-tech/knowledge-base`, then
re-vendor:

```bash
npx skills update <skill-name>
```

Both trees are listed in `.prettierignore`; `npm run format` would otherwise
rewrite them and break the pin. List any newly vendored skill there too.
