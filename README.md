# alexopwriter

A Vue single-page writing app with CodeMirror, Vim, browser draft recovery, local text files, and optional on-device writing assistance. Markdown is styled while you write: distinct heading sizes, bold and italic text, muted syntax markers, quotes, and links. The source remains editable plain text. It builds to static files and does not require Electron, a server process, an account, or an ACP provider.

## Run locally

From this project directory:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:5186. To build the static site, run `pnpm build`. Serve `dist` over HTTPS in production. Localhost also supports browser APIs that require a secure context.

## GitHub Pages

The `Verify and deploy alexopwriter` workflow tests and builds the website under the repository path, then deploys `dist` to GitHub Pages after successful pushes to `main`. In repository Settings → Pages, the publishing source must be **GitHub Actions**. Pull requests run verification without deploying.

For a local production check using the same path:

```sh
VITE_BASE_PATH=/alexopwriter/ pnpm verify
```

The base path also controls the installable app's start URL, service-worker scope, and offline navigation. Local development defaults to `/`. Browser drafts belong to the website's origin; drafts from localhost are not automatically transferred to the hosted website.

## Files and recovery

**Open file** uses the browser file picker when direct file access is supported. **Import file** reads a copy without requesting write access. **Save** writes to a selected file where supported. **Download copy** exports text in every supported browser.

Browser recovery and disk saving have separate statuses. A recovered draft has no disk binding; reopen the original file or save the recovered draft to a new file. Recovery lives in IndexedDB and is not a backup against clearing browser data.

Before writing a bound file, the app compares its current text with the last known disk text. An external change produces a conflict instead of an automatic overwrite. This is a comparison, not an operating-system file lock. Separate tabs retain their own recovery branches.

## Verification

```sh
pnpm test:logic
pnpm test:browser
pnpm verify
pnpm test:compat
```

Node tests cover document workflows with controllable external boundaries and pure review rules. Browser tests exercise real CodeMirror, IndexedDB, accessibility, and file writes through real browser file handles in origin-private storage. Playwright journeys use the built app to verify document recovery, independent undo histories, keyboard selection, writing corrections, exact file downloads, preferences, offline writing, and divergent edits in two tabs. `pnpm verify` runs those journeys in Chromium. `pnpm test:compat` runs them in Chromium and Firefox. CI runs both commands.

For a focused end-to-end run, build first with the same base path as the test command:

```sh
pnpm build
pnpm test:e2e
pnpm test:compat
```

If you set `VITE_BASE_PATH`, use the same value for the build and both test commands. A stale build with a different base path can leave the preview unable to load its scripts.

Gherkin scenarios in `tests/e2e` describe the behavior the dependency rewrite must preserve. Page objects own accessible locators, editor gestures, and waits for visible results. Scenario fixtures own downloaded-file evidence and additional tabs. Each scenario has an isolated browser context. Multi-tab recovery scenarios deliberately share one context to exercise the real browser store.

Keep application and storage code real in these journeys. Do not import editor APIs, read database records, or seed framework state from the tests. Check exported bytes and filenames for exact Markdown and Unicode fidelity. Put rule combinations and malformed-data cases in the lower test layers. When the editor implementation changes, adapt its page-object interaction boundary while retaining the scenarios and their expected outcomes.

Native operating-system permission dialogs and actual original-file overwrites require a supported-browser acceptance check. Origin-private file tests do not prove those dialogs. Real model inference is a separate opt-in check because it downloads model weights and depends on the device. After building, run `pnpm test:model`. It downloads approximately 525 MB and tests a real suggestion, undo, and generation after an offline reload. This test uses an isolated persistent browser profile, removed afterward, because the default incognito context could not cache the large model file on this host.

## Architecture

CodeMirror owns live text, selection, and undo. The document service receives immutable snapshots for persistence. Disk completion acknowledges the revision it wrote, so edits made during a save remain unsaved.

This is a standalone Vue application. Its editor uses Foolscap's paper-and-ink palette and IBM Plex Mono. It does not instantiate the desktop writer, preload API, publication services, or executable notebook cells.

See [the design decision](./DESIGN.md) for the chosen boundaries and alternatives.

## Writing assistance

Review checks repeated words, simpler wording, and long sentences. It skips code and link destinations. These are deterministic writing checks, not a comprehensive spelling or grammar checker.

Writing help optionally downloads a pinned Qwen 2.5 0.5B ONNX model through Transformers.js. Inference runs in a Web Worker using WASM. Select up to 2,000 characters and request shorter wording, clearer wording, or a heading. Review a proposal before accepting it; acceptance is undoable and rejects changed text. Model weights download from Hugging Face. The passage itself stays in the browser.

Use Remove downloaded model to clear this model’s cached weights. Shared runtime files and browser drafts remain. Offline reuse requires a successful first download and retained browser caches.
