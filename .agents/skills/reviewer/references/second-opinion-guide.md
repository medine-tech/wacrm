# Second Opinion Guide

How to request and evaluate external code review suggestions from Gemini CLI and Codex CLI. Both tools act as consultants — the base reviewer (Claude) makes all final decisions.

## Availability Detection

Check each CLI before attempting to invoke it. A non-zero exit code or missing binary means the tool is unavailable — skip it silently.

```bash
# Gemini
which gemini && gemini --version

# Codex
which codex && codex --version
```

**Decision logic:**
- Both available → invoke both, merge results
- One available → invoke that one only
- Neither available → skip Phase 5 entirely, proceed to Phase 6

## Prompt Template

Use this structured prompt for both CLIs. Replace `{CODE_TYPE}` and `{TECH_STACK}` with values from Phase 1.

```
You are a senior code reviewer. Review the following git diff for a {CODE_TYPE} codebase using {TECH_STACK}.

Focus on:
1. Correctness bugs and security issues
2. Architecture and design principle violations
3. Test quality gaps
4. Naming and readability concerns

For each finding, use this exact format:

FINDING #1
Location: <file:line or file:method>
Observation: <what the code does, factually>
Recommendation: <what to change and why>
Severity: <Critical | Major | Minor | Suggestion>

FINDING #2
...

Report your top 5 findings maximum. If fewer than 5 issues exist, report only what you find.
```

## CLI Invocation

### Gemini

Pipe the diff via stdin using the `-p` flag for prompt. Use `--output-format text` to get plain text output.

```bash
git diff {DIFF_SPEC} | gemini -p "{PROMPT}" --output-format text
```

- Read-only: Gemini does not modify files in this mode
- No tool execution flags — prompt-only invocation

### Codex

Pipe the combined prompt and diff via stdin. Use `--sandbox read-only` to prevent any file modifications.

```bash
printf '%s\n\n%s' "{PROMPT}" "$(git diff {DIFF_SPEC})" | codex exec --sandbox read-only -
```

- The trailing `-` tells Codex to read from stdin
- `--sandbox read-only` ensures no filesystem writes

### Timeouts

Both commands should complete within 120 seconds (the default Bash timeout). If a command times out, log the timeout and continue — never block the review.

## Parsing Rules

Extract findings from each CLI's output:

1. **Primary pattern:** Look for `FINDING #N` markers followed by Location, Observation, Recommendation, Severity fields
2. **Fallback:** If no `FINDING #` markers found, look for numbered items (1., 2., etc.) with issue descriptions
3. **Last resort:** If output is unstructured prose, extract up to 3 actionable suggestions as best-effort
4. **Give up gracefully:** If the output is empty, garbled, or contains no parseable review content, log "No parseable findings from {CLI}" and continue

Tag each parsed finding with its source: `[Second Opinion: gemini]` or `[Second Opinion: codex]`.

## Evaluation Protocol

For each external finding, the base reviewer scores it against 5 criteria:

| # | Criterion | Question |
|---|-----------|----------|
| 1 | **Factually correct** | Is the observation accurate about what the code does? |
| 2 | **Relevant to scope** | Does it apply to the code being reviewed (not pre-existing or out-of-diff)? |
| 3 | **Aligns with conventions** | Does it match project conventions and KB principles? |
| 4 | **Worth the change** | Is the cost of fixing proportional to the benefit? |
| 5 | **Safe** | Would applying the recommendation preserve correctness and not introduce regressions? |

**Decision rule:** Accept the finding if it scores **YES on >= 4 criteria**, with criteria **1 (factually correct) and 5 (safe) both mandatory YES**. If either criterion 1 or 5 is NO, the finding is automatically declined regardless of other scores.

**Decline reasons** — map the first failing criterion:
- Criterion 1 NO → `"Factually incorrect — [brief explanation]"`
- Criterion 2 NO → `"Out of scope — [pre-existing / not in diff]"`
- Criterion 3 NO → `"Does not align with project conventions — [brief explanation]"`
- Criterion 4 NO → `"Not worth the change — [cost vs benefit]"`
- Criterion 5 NO → `"Unsafe — [regression risk explanation]"`

**Accepted findings** are integrated into the main Findings section of the report, tagged with their source (e.g., `[Second Opinion: gemini]`). They receive a severity level and KB citation from the base reviewer.

**Declined findings** are listed in the "Declined Second-Opinion Suggestions" subsection with the source, suggestion summary, and decline reason.

## Error Handling

| Scenario | Action |
|----------|--------|
| CLI not installed (`which` returns non-zero) | Skip silently — do not mention in report |
| CLI exits with non-zero status | Log: "Gemini/Codex returned error (exit code N)" — continue review |
| Command times out (>120s) | Log: "Gemini/Codex timed out" — continue review |
| Empty output (zero bytes) | Log: "Gemini/Codex returned empty output" — continue review |
| Output with no parseable findings | Log: "No parseable findings from Gemini/Codex" — continue review |
| Partial output (some findings parseable) | Parse what is available, skip malformed entries |

**Critical rule:** No error in this phase ever blocks the review. The review must always complete with or without second opinions.

## Security Notes

- **Gemini:** Invoked in prompt-only mode — no `--yolo` or equivalent flags that enable autonomous actions
- **Codex:** Always use `--sandbox read-only` — never use `--dangerously-bypass-sandbox` or writable sandbox modes
- **No secrets in prompts:** The prompt template contains only code type and tech stack — no API keys, credentials, or sensitive data
- **Diff only:** Only the git diff is sent to external CLIs — never send full file contents or repository metadata beyond what the diff contains
