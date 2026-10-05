# Writer architecture

`src/app` composes features. `src/features/<name>` owns a product capability. `src/shared` contains reusable code with no knowledge of features or app.

Each feature owns its rules, application contracts, browser adapters, and presentation. `src/app/bootstrap.ts` creates the production workspace and assistant. `main.ts` passes those instances into Vue. Each mounted writing page owns their disposal.

## Feature ownership

- `features/documents/domain` defines recovery records, save states, and the unload safety predicate. `features/documents/application` owns document workflows and declares required ports. Its adapters implement browser file access and IndexedDB recovery. Its UI renders documents and status messages.
- `features/assistance/domain` contains deterministic writing checks and the semantic assistant contract. `features/assistance/adapters` owns Worker transport, model loading, validation, and cache removal. Its UI renders review findings and model controls.
- `features/editor` owns CodeMirror text, selections, image paste, and undo history. Its public `EditorPort` uses document identity, revision, exact selected text, and positions without exposing CodeMirror types.
- `shared/storage` contains generic IndexedDB and query subscription infrastructure. It does not import features.
- `app/application/suggestionSession.ts` composes the workspace, assistant, and editor. It owns request identity, proposal state, and acceptance. `WriterPage.vue` connects Vue subscriptions and browser lifecycle events.

The public core entrypoint of each feature is `index.ts`. Its Vue entrypoint is `ui.ts`. Separating those entrypoints lets Node tests import workflows without loading Vue components. Features do not import one another. Cross-feature composition belongs in `app`.

## Explicit dependencies

`createWorkspace` requires recovery, file access, actor identity, ID generation, a clock, and a scheduler. `recoveryDelay` configures the delay and defaults to 250 milliseconds. The scheduler returns a cancellation function so the application does not depend on browser timer handles.

The workspace imports text and a name through `importDocument`. Browser code reads the `File` before invoking that command. File pickers still open directly from the save command before queued disk work begins, preserving browser user activation.

Browser recovery and disk saving have separate discriminated states. Presentation maps those states to existing messages. The unload predicate checks the states rather than comparing UI text.

## Asynchronous editing safeguards

The suggestion session captures document identity and revision before requesting a result. A synchronous workspace subscription invalidates pending results when the active document changes. Cancellation, discard, and disposal also invalidate request identity. A revision change rejects a completed result, including revisions caused by renaming.

Acceptance checks current document identity and revision again. CodeMirror then checks the exact selected text and applies one isolated undo transaction. Moving the caret alone does not invalidate a captured passage.

The Worker adapter separately checks worker generations, request IDs, and validated response types. These checks protect transport lifecycle. They do not replace document-level checks in the suggestion session.

## Verification

`pnpm test:logic` exercises real workflows with injected in-memory storage, controlled assistant responses, and a manual scheduler. These doubles replace external capabilities. They do not replace application functions.

The recovery contract runs against both memory storage and real IndexedDB. It checks independent actor branches, older-revision rejection, equal-revision replacement, composite-key identity, and input-copy behavior. Browser Mode also checks CodeMirror, undo, image paste, IndexedDB subscriptions, and the connected suggestion workflow. The connected suggestion tests replace inference only; Vue, workspace, session, and editor remain real.

Playwright journeys cover recovery after reload, concurrent tabs, imported and downloaded files, pasted images, and offline writing. `pnpm test:compat` runs those journeys in Chromium and Firefox. `pnpm test:model` remains an explicit opt-in for real model downloads and inference.

`pnpm check:architecture` runs the local `writer-architecture/boundaries` Oxlint plugin on TypeScript and the same rule through ESLint on Vue files. Oxlint 1.80 does not execute custom rules on Vue script blocks. Both tools call `tooling/architecture.ts`, so the boundary policy has one implementation. `pnpm lint` runs both tools, and `pnpm verify` runs lint in local checks and CI.

The rule recognizes any `features/<name>` automatically. Features cannot import siblings or app. Shared cannot import features or app. External consumers use feature `index.ts` and `ui.ts`; `app/bootstrap.ts` alone may import feature adapters. Domain and application code stay browser-free, with their existing own-feature dependency rules. Imports, re-exports, import types, dynamic imports, require calls, worker URLs, configured aliases, and glob escapes are covered. New modules outside app, features, and shared are rejected.

`tests/architecture-cli.test.ts` creates temporary source trees and runs the real Oxlint and ESLint commands. Each invalid fixture must produce a boundary or UI diagnostic; valid fixtures must pass. Existing rule-level fixtures cover the finer dependency and capability cases.

## Shared UI

`shared/ui/<component>/index.ts` is the public entrypoint for each component. App and feature presentation import these entrypoints. Only shared UI imports Reka UI, the successor of Radix Vue. UI components cannot import storage. Storage cannot import UI. Neither belongs in domain or application code.

The library follows the local-source approach of [shadcn-vue](https://www.shadcn-vue.com/docs/introduction). It uses Reka `Primitive` for the button root, native fields, typed variant maps, and Tailwind utilities. It does not need a variant or class-merging dependency. Slots provide content; callers own events and business state.

- `BaseButton` has `ghost`, `primary`, `outline`, `text`, `soft`, and `inverse` variants; `sm`, `md`, and `icon` sizes. It defaults to `type="button"` and exposes `focus()`.
- `BaseInput` supports `outline` and `ghost`, native input/change events, `v-model`, and `focus()`.
- `BaseTextarea` supports `v-model`, native attributes, and `focus()`.
- `buttonClasses` exposes the same recipe for CodeMirror's DOM-owned image button. CodeMirror owns its lifecycle.

`shared/styles/tokens.css` defines light and dark theme colors, control radius, and font tokens. Tailwind uses these values in both Vite and Browser Mode. Preflight is not imported because CodeMirror and the existing document layout own their styles. Feature classes arrange components; shared variants own button appearance. The existing nonmodal panels remain features, so no unused dialog wrapper is introduced.

`writer-ui/shared-controls` rejects raw buttons, visible native fields, selects, and dialogs in app/feature Vue templates. The hidden file importer is the explicit native exception. The rule also rejects literal colors and direct control style utilities in templates. It is a targeted convention check, not a full CSS cascade proof. Browser accessibility tests and visual review cover rendered states.

Run `pnpm dev` and open `/design-system.html` for the editable component gallery. It shows variants, sizes, disabled controls, fields, tokens, and a theme toggle. Keyboard focus is visible with Tab. This development entry is not included in the production build.

## Reading and library organization

The reading feature converts Markdown into safe preview HTML and heading positions. Its single browser-free parser module may import `markdown-it`; architecture checks permit that dependency only in `features/reading/domain/markdown.ts`. Raw HTML remains disabled, and image rendering accepts embedded raster data rather than fetching remote images. Formatted output uses the same parse policy. The browser export adapter handles HTML downloads, print/PDF, and lazy DOCX generation.

Document organization belongs to existing recovery branches. Folder, favorite, and Trash changes increment the recovery revision without changing the disk content revision. Trash retains the source. Library folders are labels for browser drafts, not disk directories.

Writing preferences belong to the editor feature. The app stores validated preferences and controls quiet mode and preview layout. CodeMirror remains mounted during preview and reapplies preference compartments when restoring cached document states. Shared UI now includes `BaseSelect` and a Reka-backed `BaseDialog`.
