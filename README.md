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

Node tests cover document workflows with controllable external boundaries and pure review rules. Browser tests exercise real CodeMirror, IndexedDB, accessibility, and file writes through real browser file handles in origin-private storage. Playwright journeys use the built app to verify recovery, import/export bytes, and offline writing in Chromium. `test:compat` runs the same journeys in Chromium and Firefox. CI runs both commands.

Native operating-system permission dialogs and actual original-file overwrites require a supported-browser acceptance check. Origin-private file tests do not prove those dialogs. Real model inference is a separate opt-in check because it downloads model weights and depends on the device. After building, run `pnpm test:model`. It downloads approximately 525 MB and tests a real suggestion, undo, and generation after an offline reload. This test uses an isolated persistent browser profile, removed afterward, because the default incognito context could not cache the large model file on this host.

## Architecture

CodeMirror owns live text, selection, and undo. The document service receives immutable snapshots for persistence. Disk completion acknowledges the revision it wrote, so edits made during a save remain unsaved.

This is a standalone Vue application. Its editor uses Foolscap's paper-and-ink palette and IBM Plex Mono. It does not instantiate the desktop writer, preload API, publication services, or executable notebook cells.

See [the design decision](./DESIGN.md) for the chosen boundaries and alternatives.

## IndexedDB query atoms

The app uses its own native IndexedDB wrapper. It does not depend on Dexie or Effect. `src/storage/indexedDb.ts` owns connections, transactions, and change notifications. `src/storage/queryAtom.ts` owns shared query subscriptions. Recovery keeps the existing database and stored drafts.

Create a query once and share it between consumers. An atom exposes `snapshot()`, `read()`, and `subscribe()`. Its state is `loading`, `ready` with a value, or `error` with an error. `read()` always requests a fresh database snapshot; it does not return the subscriber cache.

```ts
import { indexedDbRecovery } from './src/documents/adapters/indexedDbRecovery'

const recovery = indexedDbRecovery()
const stop = recovery.drafts.subscribe((state) => {
	if (state.status === 'ready') console.log(state.value)
})

const savedDrafts = await recovery.drafts.read()

stop()
recovery.close()
```

In Vue setup, `useQueryAtom(() => recovery.drafts)` exposes a readonly ref and releases its subscription with the component scope. Import it from `src/storage/useQueryAtom.ts`. Keep the recovery store owned by the workspace rather than creating one per component.

For another record type, `createIndexedDbStore` accepts the database name and version, store name, key path, indexes, a decoder, and a key extractor. `store.query(rows => rows.length)` creates a count atom. `store.update(key, previous => next)` performs a synchronous read-modify-write in one transaction. Returning `undefined` skips the write. An update cannot change its key.

The wrapper covers this app's single-store schema. Changes to an existing schema require explicit migration code; changing the version alone does not migrate its indexes.

Successful commits refresh observed queries for that store. Separate store instances exchange invalidations through `BroadcastChannel`, including across tabs. Messages contain no document text. Changes made outside this wrapper are not automatically tracked. Focus and page restoration revalidate active queries, including when `BroadcastChannel` is unavailable. Queries scan the store and use table-level invalidation rather than automatic dependency tracking.

Writes remain explicit commands. Recovery's revision check rejects older writes. Live query updates do not replace CodeMirror text or rerun workspace restoration. Close the store when its owner is disposed. Closing is terminal; create a new store after a database version change.

## Writing assistance

Review checks repeated words, simpler wording, and long sentences. It skips code and link destinations. These are deterministic writing checks, not a comprehensive spelling or grammar checker.

Writing help optionally downloads a pinned Qwen 2.5 0.5B ONNX model through Transformers.js. Inference runs in a Web Worker using WASM. Select up to 2,000 characters and request shorter wording, clearer wording, or a heading. Review a proposal before accepting it; acceptance is undoable and rejects changed text. Model weights download from Hugging Face. The passage itself stays in the browser.

Use Remove downloaded model to clear this model’s cached weights. Shared runtime files and browser drafts remain. Offline reuse requires a successful first download and retained browser caches.

## Architecture

Features expose core APIs through `index.ts` and Vue components through `ui.ts`. The browser composition root creates their dependencies. See [the architecture guide](docs/architecture.md) for ownership, contracts, and tests.

Run `pnpm check:architecture` to check boundaries. If the preview port is occupied, run verification with `WRITER_TEST_PORT=5193 pnpm verify`.
