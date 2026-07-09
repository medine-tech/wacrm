<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Vendored agent skills and agents are read-only

`.agents/skills/` holds skills copied verbatim from `medine-tech/knowledge-base`
and pinned by `computedHash` in `skills-lock.json`. `.claude/skills/` symlinks
into it, so each skill has exactly one source of truth in this repo.

`.agents/agents/` holds subagent definitions copied verbatim from the same
upstream, with `.claude/agents/` symlinking into it. Claude Code only discovers
agents under `.claude/agents/`, so the symlinks are what make them resolve.

Never hand-edit anything under these four trees, and do not propose edits to
those paths in code review. A local edit forks the file for this repo alone,
diverges from the lockfile pin, and is overwritten by the next re-vendor. Fix it
upstream in `medine-tech/knowledge-base`, then pull it back down:

```bash
npx skills update <skill-name>
```

Re-vendor a skill's dependencies alongside it. `do-task` spawns the five runner
agents, and each runner preloads a role skill (`backend-architect`,
`backend-developer`, `frontend-architect`, `frontend-developer`, `reviewer`).
Vendoring `do-task` without them yields runners whose skill bodies never resolve.

Install skills with both agent targets so the layout stays consistent —
`universal` writes the real files, `claude-code` gets the symlink:

```bash
npx skills add git@github.com:medine-tech/knowledge-base \
  -s <skill-name> -a universal -a claude-code -y
```

Targeting `claude-code` alone copies real directories into `.claude/skills/`
instead, giving a skill two divergent copies and no single source of truth.

`skills-lock.json` covers skills only — the CLI does not manage agents, so
`.agents/agents/` is unpinned and `npx skills update` will not refresh it. Copy
those files from upstream `main` by hand when they change.

All four trees are listed in `.prettierignore`; `npm run format` would otherwise
rewrite them and break the pin. List any newly vendored skill or agent there too.
