# Writer architecture

Each feature owns its rules, application contracts, browser adapters, and presentation. `src/app/bootstrap.ts` creates the production workspace and assistant. `main.ts` passes those instances into Vue. Each mounted writing page owns their disposal.

## Feature ownership

- `documents/domain` defines recovery records, save states, and the unload safety predicate. `documents/application` owns document workflows and declares required ports. Its adapters implement browser file access and IndexedDB recovery. Its UI renders documents and status messages.
- `assistance/domain` contains deterministic writing checks and the semantic assistant contract. `assistance/adapters` owns Worker transport, model loading, validation, and cache removal. Its UI renders review findings and model controls.
- `editor` owns CodeMirror text, selections, image paste, and undo history. Its public `EditorPort` uses document identity, revision, exact selected text, and positions without exposing CodeMirror types.
- `storage` contains generic IndexedDB and query subscription infrastructure. It does not import features.
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

`pnpm check:architecture` parses TypeScript and Vue script blocks. It checks feature ownership, public entrypoints, application/domain dependencies, module imports, re-exports, and browser capabilities in core code. Its regression fixtures run with the logic tests. Lint includes the architecture check, so `pnpm verify` enforces the same boundaries.
