# Playwright UI Investigation

Drive the running application with a headless browser to gather visual evidence that resolves doubts code + DB analysis alone cannot answer.

## Table of Contents

- [When To Run](#when-to-run)
- [Step 1 — Get Credentials](#step-1--get-credentials)
- [Step 2 — Determine Navigation Targets](#step-2--determine-navigation-targets)
- [Step 3 — Build and Execute Playwright Script](#step-3--build-and-execute-playwright-script)
- [Step 4 — Visual Analysis](#step-4--visual-analysis)
- [Step 5 — Cross-Reference](#step-5--cross-reference)
- [Cleanup](#cleanup)
- [Rules](#rules)

## When To Run

Execute this phase when **ANY** of these apply:

- Issue references URL paths (e.g., `/pedidos/listar`, `/ordenes/crear`)
- Issue describes a visual / UI bug (wrong label, missing data, broken layout, modal issue)
- Previous phases left open questions about actual UI state
- Issue includes screenshots — the rendered UI may have drifted since the screenshot was taken
- Code tracing found frontend components (`.vue` files) involved

**Skip** if the issue is purely backend / API with no UI component.

## Step 1 — Get Credentials

Read credentials from `.env` at project root:

```bash
grep FLEXIO_QA_EMAIL .env | cut -d= -f2
grep FLEXIO_QA_PASSWORD .env | cut -d= -f2
```

If `FLEXIO_QA_EMAIL` and `FLEXIO_QA_PASSWORD` are set, use them directly. If not found, ask the user with `AskUserQuestion`:

```text
question: "No QA credentials found in .env. What email/password should I use to login to http://localhost:8888?"
options: ["I'll provide them"]
```

## Step 2 — Determine Navigation Targets

Build a list of URLs to visit from:

- URL paths parsed in Phase 1 (e.g., `/pedidos/listar`)
- Module keywords mapped via the **Flexio Navigation Index** in the project's `AGENTS.md`
- Pages related to frontend components (`.vue` files) found in Phase 4

## Step 3 — Build and Execute Playwright Script

Write a temporary `.mjs` file **in the project root** (required for `node_modules/playwright` resolution) and execute with `node`.

**Login template:**

```javascript
import { chromium } from 'playwright';
import { config } from 'dotenv';

config(); // Loads .env from project root

const BASE_URL = process.env.APP_URL?.replace(/\/$/, '') || 'http://localhost:8888';
const QA_EMAIL = process.env.FLEXIO_QA_EMAIL;
const QA_PASSWORD = process.env.FLEXIO_QA_PASSWORD;

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000); // Vue SPA mount
  await page.fill('input[name="email"]', QA_EMAIL);
  await page.fill('input[name="password"]', QA_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  return !page.url().includes('login');
}
```

**Per-page investigation pattern:**

Register the console listener **before** navigation — events fired during page load (Vue mount errors, failed asset requests, unhandled promise rejections) are exactly the signal this phase exists to capture, and they fire during `goto` and the load wait, not after.

```javascript
// Register console listener BEFORE navigation — load-time errors are the
// most diagnostic and would be missed if we attach after page.goto().
const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

// Navigate to target
await page.goto(`${BASE_URL}/pedidos/listar`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// Screenshot
await page.screenshot({ path: '/tmp/investigation-<issue-id>/page-name.png' });

// Collect grid data
const rows = await page.$$('tr.jqgrow');
console.log(`Grid rows: ${rows.length}`);

// Check for specific elements, labels, badges, etc.
const content = await page.content();
// Search for expected text, error messages, etc.
```

**Execution:**

```bash
mkdir -p /tmp/investigation-<issue-id>
node investigation-<issue-id>.mjs
```

## Step 4 — Visual Analysis

Read each screenshot using the `Read` tool (multimodal image support) and analyze:

- Do labels / headers match what the code produces?
- Are grids populated with expected data?
- Are modals, dropdowns, and forms rendering correctly?
- Any visible error messages or broken layouts?
- Does the UI state match what DB queries suggest?

## Step 5 — Cross-Reference

Compare visual findings against Phase 4 (code) and any local-DB findings:

- If a label says "X" in code but shows "Y" in UI → cache issue or wrong file
- If DB has data but grid is empty → query filter or permission issue
- If modal opens but search doesn't work → JS event binding or API endpoint issue

## Cleanup

After the report is complete, delete temporary files:

```bash
rm -f investigation-<issue-id>.mjs
rm -rf /tmp/investigation-<issue-id>/
```

## Rules

- **Read-only.** Never submit forms, click delete buttons, or modify data. The browser session uses a real QA account; mutations land in the local DB.
- Always use `headless: true`.
- Always set viewport `{ width: 1920, height: 1080 }` for consistent screenshots.
- Use `waitForTimeout` after navigation — Vue SPAs need time to mount.
- Cap script timeout at 120 seconds.
- If login fails, report it and skip the phase — do not retry endlessly.
- If a page returns 404 or error, screenshot it and move on.
- Save screenshots into `/tmp/investigation-<issue-id>/` so the cleanup step finds them; never under the project tree.
