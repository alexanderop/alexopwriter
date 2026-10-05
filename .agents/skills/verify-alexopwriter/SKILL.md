---
name: verify-alexopwriter
description: Verify alexopwriter through shared Playwright end-to-end scenarios, or explore untested browser behavior with the real Playwright CLI and retained evidence.
---

# Verify alexopwriter

Use the repository root as the working directory. Read the [feature map](features/README.md), then the relevant feature recipe. For behavior without an existing scenario, use the [Playwright CLI exploration workflow](references/exploration.md). This skill drives the production web app; no account, backend, or model download is needed.

## Launch

Install dependencies with `pnpm install --frozen-lockfile` if needed. Run `pnpm writer doctor`, then launch and drive a mapped feature with `pnpm writer verify recovery` (replace `recovery` with the requested feature). Each command builds into a unique run directory, generates the existing BDD scenarios, starts its own production preview on an available loopback port, waits for HTTP readiness, and opens isolated browser contexts. The `Document editor` textbox must become visible before actions start. Preview teardown happens within the command.

Use `--headed` to watch, `--browser firefox` for Firefox (default: Chromium), or `--port 5197` for a specific free port. Existing servers are never reused. For the Pages deployment path, prefix the command with `VITE_BASE_PATH=/alexopwriter/`; the CLI uses that path for both build and browser navigation.

## Doctor

`pnpm writer doctor --browser chromium` checks Node, pnpm, the installed Playwright browser executable, and the configured base path without starting or modifying an app. Use `--browser firefox` when that browser is requested. A successful doctor is prerequisite evidence, not application proof. The verification run performs it again and checks its own HTTP entrypoint before Playwright drives the UI. If a browser is missing, install the requested browser with `pnpm exec playwright install chromium` or `pnpm exec playwright install firefox`, then repeat doctor.

## Drive

Choose `pnpm writer verify` for existing automated coverage. Choose `pnpm browser` for interactive investigation, untested flows, or viewport checks. It exposes the real Playwright CLI already included in the pinned dependency. Run `pnpm browser --help` and follow [Exploration](references/exploration.md) for owned sessions, evidence, and cleanup. Free-form exploration does not need a pre-existing page object; promote useful regression checks into the shared suite afterward.

`pnpm writer list` lists the five mapped groups. `pnpm writer verify all` runs all groups. For machine-readable stdout use `pnpm --silent writer verify recovery --json`; progress goes to stderr and the final JSON names the evidence directory.

The CLI selects tagged [writer scenarios](../../../tests/e2e/writer.feature) , [image scenarios](../../../tests/e2e/images.feature), and [writing experience scenarios](../../../tests/e2e/writing-experience.feature). Both ordinary E2E tests and verification use the same [WriterPage](../../../tests/e2e/pages/WriterPage.ts) and [ImagePage](../../../tests/e2e/pages/ImagePage.ts). Keep maintained automated scenarios and selectors in those files. Exploratory CLI actions may use fresh snapshots; do not turn them into a second maintained test suite. Use visible controls and browser events; do not seed Vue, CodeMirror, or IndexedDB internals.

## Evidence

Every automated writer verification run prints an absolute path to `verification-artifacts/run-*/summary.json`. It records feature, browser, base path, timestamps, counts, outcome, and artifact paths. Retained evidence includes `doctor.json`, `commands.log`, `report.json`, `html/index.html`, and `results/` with traces, screenshots, and scenario attachments such as downloaded Markdown.

For automated runs, require exit code zero and `status: passed`, with at least one passed scenario and no failed, skipped, or flaky scenarios. Inspect the report and relevant traces: a final screenshot alone does not prove the action. Download scenarios compare filenames and bytes; recovery scenarios observe content after reload or in another tab. Report the selected feature and browser, observed outcomes, and concrete evidence paths. A failed build or missing browser is an unsuccessful attempt, not behavior proof.

Image paste uses a synthetic browser paste event; it does not prove OS clipboard integration. Native file-permission dialogs and original-file overwrites are outside these journeys. Real model inference remains the separate, opt-in `pnpm test:model` workflow; do not claim it from `verify all`.

## Cleanup

For automated runs, normal completion, failure, and handled interruption stop processes owned by the run, close browser contexts, and remove only its temporary `build/` and `generated/` directories. Retain the entire evidence directory. After a run, confirm its summary and relevant trace/download files still exist and its recorded loopback port is no longer serving. If abnormal termination leaves a process, identify the process belonging to that run before stopping it; never kill by process name or stop a user's existing server.

For exploratory runs, explicitly close the named browser session and stop your preview terminal as described in [Exploration](references/exploration.md).

## Helpers

The shared helper is [scripts/writer-cli.ts](../../../scripts/writer-cli.ts), invoked through `pnpm writer`; `pnpm writer --help` shows its interface. The `pnpm browser` command exposes Playwright CLI directly, without a custom action wrapper. Keep the feature map aligned with the scenarios; the explicitly invoked aop-mode `maintain-verification-skill` workflow can guide later upkeep when available.
