# Quality Gate

## Target Detection

Before running checks, detect which targets are available.

### Makefile targets

```bash
# Check for available make targets
grep -E '^(test|static-analysis|check-cs|fix-cs|integration-tests):' Makefile 2>/dev/null
```

### Frontend tests

```bash
# Check for package.json test scripts
cat package.json 2>/dev/null | grep -E '"test"' || true
cat turbo.json 2>/dev/null | grep -E '"test"' || true
```

---

## Execution Order (fail-fast)

Run checks in this order. Stop at the first failure and fix before continuing.

1. **Auto-fix first** — if `make fix-cs` target exists, run it before check-cs
   ```bash
   make fix-cs
   ```

2. **Code style check**
   ```bash
   make check-cs
   ```

3. **Static analysis**
   ```bash
   make static-analysis
   ```

4. **Unit tests**
   ```bash
   make test
   ```

5. **Frontend tests** (if package.json has a test script)
   ```bash
   npm test
   # or: npx turbo run test
   ```

### Skipped by default

- **`make integration-tests`** — requires a running environment (database, services). Skip unless the user explicitly requests it.

---

## Fix-Retry Loop

When a check fails:

1. **Parse the failure output** — identify the specific error(s)
2. **Apply a fix** — edit the affected file(s)
3. **Re-run the failed check** — verify the fix resolved the issue
4. **Repeat** up to **3 iterations** per failing check

After 3 failed retries on the same check:
- **Stop** — do not keep retrying
- **Show the user** the full error output
- **Ask** for guidance on how to proceed

---

## Failure Parsing Hints

### PHPStan (static-analysis)

```
 ------ ----------------------------------------
  Line   path/to/File.php
 ------ ----------------------------------------
  42     Error message here
 ------ ----------------------------------------
```

Look for the `Line` and file path to locate the error.

### ECS / check-cs

```
 ------ ----------------------------------------
  FILE   path/to/File.php
 ------ ----------------------------------------
  :42    Error description (SniffName)
 ------ ----------------------------------------
```

Often auto-fixable via `make fix-cs`. If `fix-cs` doesn't resolve it, fix manually.

### PHPUnit (test)

```
FAILURES!

Tests: X, Assertions: Y, Failures: Z.

1) Namespace\TestClass::testMethod
Failed asserting that ...
path/to/TestFile.php:42
```

Read the test file and the tested class to understand the failure.

### Behat (acceptance tests)

```
--- Failed scenarios:

    features/some.feature:42
```

Read the feature file and step definitions to understand the scenario.

---

## Post-Gate

After all checks pass:
- Stage the changes: `git add <affected files>`
- Commit with a descriptive message referencing the bot review
- Record the commit hash for Phase 5.5 fix confirmations
