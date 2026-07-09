# Reactions and Replies

## Reaction API Endpoints

### Issue comments (non-inline)

```bash
# Thumbs up
gh api repos/{owner}/{repo}/issues/comments/{comment_id}/reactions -f content="+1"

# Thumbs down
gh api repos/{owner}/{repo}/issues/comments/{comment_id}/reactions -f content="-1"
```

### PR review comments (inline)

```bash
# Thumbs up
gh api repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions -f content="+1"

# Thumbs down
gh api repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions -f content="-1"
```

---

## Reply API Endpoints

### Inline thread reply (PR review comment)

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments \
  -f body="<message>" \
  -F in_reply_to={comment_id}
```

### Issue-level reply

```bash
gh pr comment {pr_url} --body "<message>"
```

When replying to an issue comment, reference the original by quoting its first line.

---

## Reply Templates

### INVALID — Respectful decline

```
**Respectfully declining this suggestion.**

Reason: [Clear, concise explanation]

[Optional: What the correct approach is]
```

Examples:
- "This code follows the repository convention defined in CLAUDE.md where X uses pattern Y."
- "This addresses a pre-existing issue outside the scope of this PR."
- "The suggested change would break the existing contract with Z."

### Fix confirmation (used in Phase 5.5)

```
Fixed in commit {hash}.
```

---

## Tone Rules

- Be professional and constructive
- Explain the "why" — don't just say "no"
- Reference project conventions when applicable (CLAUDE.md, architecture patterns)
- Acknowledge when the suggestion identifies a real issue even if the fix approach is wrong
- Never be dismissive: "Wrong" or "This is not how we do things" is not acceptable
