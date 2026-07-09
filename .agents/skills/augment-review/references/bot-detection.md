# Bot Detection

## Generic Detection Strategy

Detect **any** GitHub App bot — not just known ones. This avoids updating the skill when new bots appear.

### Detection criteria

A comment author is a bot if **either**:
- `user.type == "Bot"`
- `user.login` ends with `[bot]`

### Timestamp filtering

Only process comments posted **after** the trigger timestamp. This avoids re-evaluating old bot comments from previous runs.

---

## API Queries

### Issue comments (non-inline)

```bash
gh api repos/{owner}/{repo}/issues/{pr_number}/comments \
  --jq '[.[] | select(.user.type == "Bot" or (.user.login | endswith("[bot]"))) | {id: .id, body: .body, user: .user.login, created_at: .created_at, html_url: .html_url}]'
```

### PR review comments (inline)

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments \
  --jq '[.[] | select(.user.type == "Bot" or (.user.login | endswith("[bot]"))) | {id: .id, body: .body, path: .path, line: .line, user: .user.login, created_at: .created_at, in_reply_to_id: .in_reply_to_id}]'
```

### Pagination

Both endpoints default to 30 results. For PRs with many comments, add `--paginate` to fetch all pages.

---

## Grouping

Group collected comments by `user.login` for per-bot processing. Process each bot's comments through the same Phase 3-6 workflow.

---

## Known Bot Notes

### augmentcode[bot]
- Posts a **PR Summary** comment with "Was this summary useful? React with thumbs up or thumbs down"
- **Always** react to the summary: `+1` if accurate, `-1` if not
  ```bash
  gh api repos/{owner}/{repo}/issues/comments/{summary_comment_id}/reactions -f content="+1"
  ```
- Inline review comments appear as PR review comments

### coderabbitai[bot]
- Posts a **Walkthrough** issue comment — skip this during analysis (it's a summary, not a suggestion)
- Actionable suggestions appear as PR review comments with specific code changes
- Often provides more detailed suggestions than other bots

### codex[bot] / other bots
- May post issue-level comments only (no inline review comments)
- Apply the same VALID/INVALID analysis workflow
- If the bot's comment format is unfamiliar, parse it best-effort

---

## Filtering Bot Replies

Bot comments that are replies to other comments (where `in_reply_to_id` is set) should generally be **skipped** — they're follow-ups to existing threads, not new suggestions.
