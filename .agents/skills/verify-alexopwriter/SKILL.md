---
name: verify-alexopwriter
description: Verify alexopwriter's browser writing, recovery, offline use, and file portability through the same Playwright scenarios and page objects as its end-to-end tests.
---

# Verify alexopwriter

Use the repository root as the working directory. Read the [feature map](features/README.md), then the relevant feature recipe. This skill drives the production web app; no account, backend, or model download is needed.

## Launch

Install dependencies with `pnpm install --frozen-lockfile` if needed. Run `pnpm writer doctor`, then launch and drive a mapped feature with `pnpm writer verify recovery` (replace `recovery` with the requested feature). Each command builds into a unique run directory, generates the existing BDD scenarios, starts its own production preview on an available loopback port, waits for HTTP readiness, and opens isolated browser contexts. The `Document editor` textbox must become visible before actions start. Preview teardown happens within the command.

Use `--headed` to watch, `--browser firefox` for Firefox (default: Chromium), or `--port 5197` for a specific free port. Existing servers are never reused. For the Pages deployment path, prefix the command with `VITE_BASE_PATH=/alexopwriter/`; the CLI uses that path for both build and browser navigation.

## Doctor

`pnpm writer doctor --browser chromium` checks Node, pnpm, the installed Playwright browser executable, and the configured base path without starting or modifying an app. Use `--browser firefox` when that browser is requested. A successful doctor is prerequisite evidence, not application proof. The verification run performs it again and checks its own HTTP entrypoint before Playwright drives the UI. If a browser is missing, install the requested browser with `pnpm exec playwright install chromium` or `pnpm exec playwright install firefox`, then repeat doctor.

## Drive

`pnpm writer list` lists the five mapped groups. `pnpm writer verify all` runs all groups. For machine-readable stdout use `pnpm --silent writer verify recovery --json`; progress goes to stderr and the final JSON names the evidence directory.

The CLI selects tagged [writer scenarios](../../../tests/e2e/writer.feature) and [image scenarios](../../../tests/e2e/images.feature). Both ordinary E2E tests and verification use the same [WriterPage](../../../tests/e2e/pages/WriterPage.ts) and [ImagePage](../../../tests/e2e/pages/ImagePage.ts). Add new behavior there and in its scenario instead of introducing a second set of selectors in this skill or CLI. Use visible controls and browser events; do not seed Vue, CodeMirror, or IndexedDB internals.

## Evidence

Every run prints an absolute path to `verification-artifacts/run-*/summary.json`. It records feature, browser, base path, timestamps, counts, outcome, and artifact paths. Retained evidence includes `doctor.json`, `commands.log`, `report.json`, `html/index.html`, and `results/` with traces, screenshots, and scenario attachments such as downloaded Markdown.

Require exit code zero and `status: passed`, with at least one passed scenario and no failed, skipped, or flaky scenarios. Inspect the report and relevant traces: a final screenshot alone does not prove the action. Download scenarios compare filenames and bytes; recovery scenarios observe content after reload or in another tab. Report the selected feature and browser, observed outcomes, and concrete evidence paths. A failed build or missing browser is an unsuccessful attempt, not behavior proof.

Image paste uses a synthetic browser paste event; it does not prove OS clipboard integration. Native file-permission dialogs and original-file overwrites are outside these journeys. Real model inference remains the separate, opt-in `pnpm test:model` workflow; do not claim it from `verify all`.

## Cleanup

Normal completion, failure, and handled interruption stop processes owned by the run, close browser contexts, and remove only its temporary `build/` and `generated/` directories. Retain the entire evidence directory. After a run, confirm its summary and relevant trace/download files still exist and its recorded loopback port is no longer serving. If abnormal termination leaves a process, identify the process belonging to that run before stopping it; never kill by process name or stop a user's existing server.

## Helpers

The shared helper is [scripts/writer-cli.ts](../../../scripts/writer-cli.ts), invoked through `pnpm writer`; `pnpm writer --help` shows its interface. No skill-specific browser driver is needed. Keep the feature map aligned with the scenarios; the explicitly invoked aop-mode `maintain-verification-skill` workflow can guide later upkeep when available.
