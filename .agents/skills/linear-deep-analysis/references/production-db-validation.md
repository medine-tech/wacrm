# Production Database Validation

How the skill validates current-state claims against a production database to
raise report confidence. This is a **gated** step inside Phase 5 — read it
only when Phase 4 produced a claim that code cannot settle and live data can.

## Table of Contents

- [When This Runs](#when-this-runs)
- [The Safety Model](#the-safety-model)
- [The SQL-Shape Guard](#the-sql-shape-guard)
- [Step 1 — Confirm the Gap Is Real](#step-1--confirm-the-gap-is-real)
- [Step 2 — Resolve Project and Credentials](#step-2--resolve-project-and-credentials)
- [Step 3 — Find the Running DB Container](#step-3--find-the-running-db-container)
- [Step 4 — Ask for the Production Host](#step-4--ask-for-the-production-host)
- [Step 5 — Run the Queries](#step-5--run-the-queries)
- [What Goes in the Report](#what-goes-in-the-report)
- [Failure Handling](#failure-handling)

## When This Runs

Code shows what is *possible*; the production database shows what *actually
is*. The skill connects to production only when both hold:

1. Phase 4 produced a **specific, named claim** that code alone cannot settle
   — a row's existence, a count, a production config or enum value.
2. That claim materially affects the feasibility verdict or its confidence.

It never runs speculatively, and most issues never need it. Collect *every*
DB-answerable gap from the Phase 5 gap analysis and escalate **once**, as a
batch — one connection, all queries, then re-assess confidence. A gap that
surfaces *after* validation goes to Unresolved Questions; there is one
escalation round, not a loop.

The database confirms current state — it never substitutes for understanding
the code path. Confidence may only rise *after* Phase 4 has traced the code;
a live-data check does not excuse an untraced claim.

Production-DB validation is **separate from** local-DB exploration
(`local-db-investigation.md`). Local DB has fixture data and informs the code
map; production DB carries real data and validates feasibility claims. Do not
substitute one for the other.

## The Safety Model

Two layers protect production, in this order:

1. **The DB grant.** `PRODUCTION_DEBUG_DB_USER` is a database account with
   `SELECT`-only privileges. Even a malformed query cannot write — the
   database itself rejects it. This is the guarantee.
2. **The SQL-shape guard** (below). The skill refuses to *send* anything that
   is not a read. This is defense-in-depth — and because this skill commonly
   runs in a non-prompting permission mode, it is the last checkpoint if a
   project ever wires `PRODUCTION_DEBUG_DB_USER` to a broader account by
   mistake. Treat it as load-bearing, not optional.

The skill assumes `PRODUCTION_DEBUG_DB_USER` is SELECT-only. If a project
cannot confirm that, do not run this step — record the gap as an Unresolved
Question instead.

## The SQL-Shape Guard

Before sending any query, validate the exact query string:

- **Prefix check.** Trim the query and uppercase a copy. It **must begin with
  `SELECT`, `SHOW`, or `EXPLAIN`.** A query starting with `UPDATE`, `DELETE`,
  `INSERT`, `DROP`, `ALTER`, `CALL`, or `SET` is refused outright.
- **Forbidden-clause scan.** Some statements begin with `SELECT` yet still
  write or take locks, so the prefix check alone is not enough. Even when the
  prefix matches, refuse the query if the uppercased copy contains `INTO`
  (`SELECT ... INTO OUTFILE` / `INTO DUMPFILE` / `INTO @var`) or any
  row-locking clause — `FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE`,
  `FOR KEY SHARE` (PostgreSQL), or `LOCK IN SHARE MODE` (MySQL). A read takes
  no locks and writes nothing.
- **Single statement.** Reject anything with a `;` followed by more SQL
  (statement stacking).
- If a query fails any check, never "fix" it into a write. Drop it and record
  the gap as an Unresolved Question.

The guard runs on the literal query string, every time, with no exceptions.

## Step 1 — Confirm the Gap Is Real

For each candidate gap, write down the exact question and the single fact
that answers it. If the question can be answered by reading code, it is not a
DB gap — answer it in Phase 4 instead. Only gaps that genuinely turn on live
data reach Step 2.

## Step 2 — Resolve Project and Credentials

Phase 4 already identified the project (Flexio / Portal). The table the gap
names belongs to one project — that project's root `.env` supplies the
connection. Source it so credentials stay in shell variables rather than
being pasted into commands:

```bash
set -a
source <project-root>/.env
set +a
```

Keys used:

- `PRODUCTION_DEBUG_DB_USER` / `PRODUCTION_DEBUG_DB_PASS` — the SELECT-only
  production debug account.
- `DB_CONNECTION` — the engine (`mysql` or `pgsql`), which picks the client.
- `DB_DATABASE` — the schema name.

If `PRODUCTION_DEBUG_DB_USER` / `PRODUCTION_DEBUG_DB_PASS` are absent, the
project is not set up for this — record the gap as an Unresolved Question and
stop. Note: `DB_HOST` in `.env` is `localhost` and `DB_PORT` is the local
port — neither describes production. Production host and port come from the
user (Step 4).

## Step 3 — Find the Running DB Container

The connection runs through the project's already-running local DB container,
used as a client. From the project root:

```bash
docker compose ps
```

Identify the DB service by image name (`mysql`, `mariadb`, `postgres`),
narrowed by `DB_CONNECTION`. Then:

- **Exactly one** DB service running → use it.
- **Several** → ask the user which one with `AskUserQuestion`.
- **None** → the local stack is down. Do not start it — that is a heavy,
  unrequested side effect. Tell the user to start it and re-run, or record
  the gap as an Unresolved Question.

If `docker` / `docker compose` is unavailable, skip — the same graceful-skip
pattern other parts of the pipeline use.

## Step 4 — Ask for the Production Host

The production host is **never stored** — not in `.env`, not in the repo, not
in the report. Ask the user each run:

> Production DB host for `<project>`? Give the IP, or `IP:PORT` if the port
> is not the default (`3306` MySQL / `5432` Postgres).

The host exists only at runtime. It must not appear in the final report or in
any file under `~/Downloads/linear-*/`.

## Step 5 — Run the Queries

Run each guard-approved query through the DB container's client, pointed at
the production host. Pass the query on **stdin via a quoted heredoc** — never
through `-e "..."`. The quoted delimiter (`<<'SQL'`) blocks all shell
expansion, so a `$`, backtick, or `$(...)` inside the query reaches the client
literally instead of being evaluated by the shell first.

MySQL / MariaDB:

```bash
docker compose exec -T -e MYSQL_PWD="$PRODUCTION_DEBUG_DB_PASS" <db-service> \
  mysql --connect-timeout=10 \
  -h "<PRODUCTION_HOST>" -P "<PRODUCTION_PORT>" \
  -u "$PRODUCTION_DEBUG_DB_USER" "$DB_DATABASE" <<'SQL'
<guard-approved SELECT>
SQL
```

PostgreSQL — same shape with `PGPASSWORD`, and `psql --host <host> --port
<port> --username "$PRODUCTION_DEBUG_DB_USER" "$DB_DATABASE"` with the query
again on stdin via `<<'SQL'`.

`MYSQL_PWD` / `PGPASSWORD` keep the password off the container's process
list. `--connect-timeout` makes a firewalled or wrong host fail fast instead
of hanging. On a query syntax error, self-correct and retry — **at most
twice** — then degrade.

## What Goes in the Report

Production rows hold real PII (names, emails, tax IDs, amounts). The skill may
read full rows while analyzing, but the report records only the **minimal
finding that settles the gap**:

- *"row exists for account 4471: yes"* — not the row
- *"count = 3 orphaned records"* — not the records
- *"production `invoice_mode` = `'v2'`"* — config and enum values are fine
- when a raw PII value *is* the answer, generalize it (*"contact email is
  set"*, not the address)

Raw result rows are never written to `~/Downloads/linear-*/`. Each DB-verified
finding cites the **query that produced it** (the query text is a `SELECT`
and carries no PII) and is marked `(verified — production DB, YYYY-MM-DD)` —
the same `(verified)` convention used for code references. These findings
populate Section 5.6 of the report template.

## Failure Handling

Every failure path degrades the same way: the affected gap moves to the
report's Unresolved Questions, and overall confidence is **capped at Medium**.
The DB step enhances confidence — it never blocks the report.

| Failure | Handling |
|---------|----------|
| `docker` not installed | Skip, note in report |
| Local stack not running | Ask user to start it; else degrade |
| Host unreachable / timeout | Tell the user (check VPN / bastion / IP); degrade |
| Query syntax error | Self-correct, max 2 retries, then degrade |
| Permission denied on a query | The SELECT-only grant working as intended; log and degrade |
| New gap surfaced by a result | Goes to Unresolved Questions — one escalation round only |
