# Explore behavior without an existing test

Use the real Playwright CLI through `pnpm browser`. It resolves to `playwright cli` in this repository's pinned Playwright installation. No global install or additional browser driver is required. Run `pnpm browser --help` and `pnpm browser <command> --help` for the installed command syntax.

## Start an owned preview and session

For a production preview, run `VITE_BASE_PATH=/ pnpm build`, then run `pnpm preview --port 5198` in a terminal you own. Wait for its local URL. Choose another free port if 5198 is occupied; do not reuse or stop that port's existing process. Keep the build and preview base path consistent. For offline behavior, use this production preview rather than the development server.

Run these commands from the repository root. Replace `writer-explore` with a unique session name for this task and use that same `-s` value in every command.

```sh
pnpm browser -s=writer-explore open http://127.0.0.1:5198/
pnpm browser -s=writer-explore tracing-start
pnpm browser -s=writer-explore snapshot
```

Add `--headed` to `open` to watch the browser. `pnpm browser list` shows sessions. These CLI browser choices can differ from the E2E runner's project names; read `open --help` before choosing a browser. A missing browser must be installed using the CLI's documented installation command.

The session persists across CLI calls. Its default profile is temporary. Do not attach to a user's browser or choose a persistent profile for disposable verification.

## Drive what is visible

Inspect a fresh snapshot and use its element references or observed accessible names. References belong to the current page state; refresh the snapshot after navigation or layout changes. Do not copy example reference IDs into a new session.

For example, after the snapshot shows the **Settings** button:

```sh
pnpm browser -s=writer-explore click "getByRole('button', { name: 'Settings', exact: true })"
pnpm browser -s=writer-explore snapshot
```

Use `resize 390 844` to explore a narrow viewport. This changes viewport dimensions; it does not emulate a complete mobile device. Use `open --device` when device emulation is the requirement.

Use `fill`, `press`, `upload`, and other CLI actions for the user path. `run-code` can combine visible UI actions with explicit assertions when needed. Do not replace the behavior under investigation with internal Vue, CodeMirror, or IndexedDB setters. Do not mock a network path whose real behavior is the purpose of the check.

An action completing is not proof that the feature works. Check the expected text, visible state, downloaded bytes, or persistence after reload. Inspect `console` and `requests` when diagnosing errors. A `run-code` snippet can throw when the observed result differs from the expected result.

## Keep evidence and close only your session

Create a task-specific directory under `verification-artifacts/` and retain the commands and observed outcomes there. For example:

```sh
mkdir -p verification-artifacts/exploration-settings
pnpm browser -s=writer-explore snapshot --filename=verification-artifacts/exploration-settings/after.yaml
pnpm browser -s=writer-explore screenshot --filename=verification-artifacts/exploration-settings/after.png
pnpm browser -s=writer-explore tracing-stop
pnpm browser -s=writer-explore close
```

`tracing-stop` prints its trace paths. Retain those files and their resources, or copy the complete trace output to the task evidence directory. Default snapshots and traces in `.playwright-cli/` are ignored by Git. Keep them until the evidence has been reviewed. Stop the preview with Ctrl-C in the terminal that started it and confirm its port no longer serves the app. Close the named browser even after a failed action; do not use `close-all` or `kill-all` because other tasks may own sessions.

Report this as an exploratory check with the actions, browser, viewport, expected result, actual result, limitations, and evidence paths. It is not a passed automated suite and does not produce the writer CLI's `summary.json` contract. When the behavior warrants regression coverage, put a durable scenario and reusable actions into the existing Gherkin suite and page objects. Do not maintain a second copy of that scenario in an exploration script.
