# Local Database Investigation

Read-only exploration of the project's **local** database to inform Phase 4 codebase research. This is a routine, exploratory step — not the gated production-DB validation step (see `production-db-validation.md` for that).

## Table of Contents

- [When This Runs](#when-this-runs)
- [Connection](#connection)
- [Schema Query](#schema-query)
- [Foreign Keys](#foreign-keys)
- [Reverse Foreign Keys](#reverse-foreign-keys)
- [Sample Data](#sample-data)
- [Cross-Table Flow Validation](#cross-table-flow-validation)
- [Rules](#rules)

## When This Runs

Run a local-DB query when Phase 4 code tracing names a table whose **shape**, **foreign keys**, or **sample data** would settle a design question — e.g., "does this table actually carry the column the code claims to write to?", "which other tables point to it?", "what does a real row look like in this state column?".

Local DB queries inform code understanding. They are **not** a substitute for production validation: a local DB has fixture data, not live data. When a question turns on what is *actually true in production*, escalate to Phase 5 production-DB validation instead.

## Connection

The Flexio local stack runs MySQL inside docker-compose. From the project root:

```bash
docker compose exec mysql mysql -u root --password="FlexioPass." flexio -e "<query>;"
```

If the local stack is down, start it (`docker compose up -d mysql`) or skip — do not block on it.

## Schema Query

```bash
docker compose exec mysql mysql -u root --password="FlexioPass." flexio -e "DESCRIBE <table_name>;"
```

Note column names, types, defaults, and NULL constraints. Suspicious patterns:

- A column the code writes to but that does not exist
- A column with an unexpected default (e.g., `0` vs `NULL`) that may explain a behavior
- A nullable column the code dereferences without a null check

## Foreign Keys

```bash
docker compose exec mysql mysql -u root --password="FlexioPass." flexio -e "
SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA='flexio'
  AND TABLE_NAME='<table_name>'
  AND REFERENCED_TABLE_NAME IS NOT NULL;"
```

Tells you which tables this one depends on.

## Reverse Foreign Keys

Tables pointing **to** this table:

```bash
docker compose exec mysql mysql -u root --password="FlexioPass." flexio -e "
SELECT TABLE_NAME, COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA='flexio'
  AND REFERENCED_TABLE_NAME='<table_name>';"
```

Useful when assessing change blast-radius — a column rename on this table affects every reverse-FK table.

## Sample Data

```bash
docker compose exec mysql mysql -u root --password="FlexioPass." flexio -e "SELECT * FROM <table_name> LIMIT 5;"
```

Use `LIMIT 5`–`LIMIT 10` for shape inspection. Larger limits are rarely useful for design questions.

## Cross-Table Flow Validation

Once Phase 4 has traced a code path through several tables, write a JOIN that walks the flow:

```bash
docker compose exec mysql mysql -u root --password="FlexioPass." flexio -e "
SELECT f.id, f.estado, fi.cantidad, p.codigo
FROM fac_facturas f
JOIN fac_factura_items fi ON fi.factura_id = f.id
JOIN inv_items p ON p.id = fi.item_id
LIMIT 3;"
```

Adapt the JOINs to the flow being investigated. This catches mismatches where the code assumes a join but the DB rows don't actually link the way the code reads.

## Rules

- **Read-only.** Never run `UPDATE`, `DELETE`, `INSERT`, `ALTER`, `DROP`, or any statement that mutates state. Local DB pollution is recoverable but wastes time.
- **Always `LIMIT`** on data queries — max 10 rows for exploration.
- **Eloquent vs raw table names.** If a table name from code doesn't exist, check the Eloquent model's `$table` property (see `docs/databases/eloquent-table-verification.md` in the project repo). Many Flexio Eloquent models map to a renamed legacy table.
- **NULL pattern observations belong in the report.** When sample data reveals a column is always NULL despite being written to in code (or always populated despite being nullable), note it in Section 4 of the report — it is often the root cause of the reported behavior.
- **Skip gracefully.** If `docker` is unavailable, the stack is down, or queries time out: log it, move on, and degrade the report's confidence accordingly. Do not retry endlessly.
