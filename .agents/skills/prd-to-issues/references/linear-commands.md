# Linear CLI Commands for PRD-to-Issues

Command patterns for creating sub-issues and managing blocking relations.

## Issue Creation

Always use `--description-file` for markdown content. Inline `--description` breaks on backticks, newlines, and special characters.

```bash
# Write description to temp file
cat > /tmp/slice-{n}.md <<'EOF'
{issue description from template}
EOF

# Create sub-issue
linear issue create \
  --title "{Imperative title}" \
  --description-file /tmp/slice-{n}.md \
  --parent {PARENT_ISSUE_ID} \
  --estimate {XS|S|M|L|XL} \
  --assignee self \
  -s backlog \
  --label "{AFK or HITL}" \
  --team {TEAM_KEY}
```

Flags to omit when not applicable:
- `--parent`: Only when a parent issue exists
- `--team`: Omit to use the Linear CLI default team
- `--label`: Omit if the label doesn't exist in the workspace yet

## Capturing Issue IDs

The `linear issue create` command outputs the created issue identifier (e.g., `Created CSU-123`). Parse this from stdout to use in subsequent relation commands.

If output parsing fails, verify with:
```bash
linear issue view {expected-ID} --json
```

## Adding Relations

Relations are added AFTER all issues are created. The `issue create` command does NOT have relation flags -- this is a separate pass.

```bash
# Slice 2 is blocked by Slice 1
linear issue relation add {SLICE-2-ID} blocked-by {SLICE-1-ID}

# Slice 4 is blocked by Slice 2 AND Slice 3
linear issue relation add {SLICE-4-ID} blocked-by {SLICE-2-ID}
linear issue relation add {SLICE-4-ID} blocked-by {SLICE-3-ID}
```

Available relation types: `blocked-by`, `blocks`, `related`, `duplicate`

## Creating a Parent Issue (When Needed)

If the PRD came from conversation or a file (not a Linear issue), create a parent first:

```bash
cat > /tmp/prd-parent.md <<'EOF'
{PRD content or summary}
EOF

linear issue create \
  --title "{Feature Name}" \
  --description-file /tmp/prd-parent.md \
  --assignee self \
  -s backlog
```

## Fallback

If any CLI command fails, present the issue description as a markdown code block. The user pastes it into Linear manually. Never block the workflow on CLI failures.
