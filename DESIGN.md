# Browser writing boundaries

alexopwriter is a standalone browser app inspired by Foolscap's writing experience while giving file permission, recovery, and model inference their own browser implementations. The existing desktop document API carries native path and publication assumptions, so implementing a browser imitation would retain unwanted dependencies.

## Ownership

CodeMirror owns editable text, selection, history, and accepted edits. Vue owns the visible layout and controls. The document service owns immutable save snapshots, revision acknowledgements, recovery scheduling, and file bindings. Browser adapters own IndexedDB and permissioned file handles. The assistance worker owns model loading and inference.

A save captures a document and its revision. Completion updates that document's saved revision, even if the user has switched documents or continued typing. Browser recovery success never implies disk success.

Each browser actor has its own recovery branch. Competing tabs preserve both versions without a distributed merge protocol. Disk writes still compare the file's current contents with its baseline; this does not remove the race with another program writing between comparison and commit.

A writing suggestion carries the document identity, revision, and original passage. Acceptance rejects a changed target and enters a separately undoable CodeMirror transaction. Cancellation invalidates the pending result and terminates model work.

## IndexedDB query ownership

The native IndexedDB store owns its connection and query atoms. Each atom shares loading, ready, or error state between subscribers. Observation starts with the first subscriber and stops with the last. One-shot reads use fresh transactions, so startup recovery does not depend on an observer cache. Vue adapts subscriptions to component lifetime without taking ownership of the database.

Recovery retains database `alexopwriter-web`, native version 10, and the `drafts` store with compound key `['id', 'actor']`. The previous Dexie declaration used version 1, which corresponds to native version 10. The schema keeps its `id` and `updatedAt` indexes. Zod validates stored rows and incoming writes.

An update reads and compares the previous revision inside the same readwrite transaction that queues the write. Equal revisions remain accepted. Only transaction completion acknowledges persistence and invalidates queries. Each store owner publishes commit notifications through its own BroadcastChannel. Other owners reread IndexedDB rather than accepting row data from a message.

The selected design combines a reusable typed store with database-owned query atoms. Recovery's existing `list()` uses its drafts atom's fresh `read()` operation. A recovery-only implementation would remove Dexie but would not provide the reusable wrapper requested. A general atom registry would introduce dependency tracking and provisioning beyond this app's needs. Record families and implicit writable atoms add competing persistence paths, so the wrapper retains explicit guarded updates.

Whole-store queries and table-level invalidation trade query precision for a small API. Cross-tab updates are eventual. Focus and page restoration revalidate observations when notifications were missed. Query updates never overwrite the live editor or automatically append recovered documents to the workspace.

## Alternatives considered

Three design sketches compared a document service, a reducer with interpreted commands, and reuse through the desktop API. The service was selected for its small caller interface and isolated browser boundaries. The reducer's exact revision acknowledgement was retained as an invariant. Selective editor reuse was retained; the full desktop API was rejected because it includes publication and process operations.

## Verification boundaries

Controlled file and worker implementations test application ordering and failure behavior. Real IndexedDB and CodeMirror tests prove their browser mechanisms. Built-app journeys prove packaging, recovery after reload, downloads, and offline availability. Real native picker permissions and downloaded-model performance remain separate device checks.

## Assistance loading

Transformers.js 4.3 performs unpinned file discovery both in `pipeline()` and inside `AutoTokenizer.from_pretrained()`: tokenizer discovery requests `tokenizer_config.json` from `main` even when a revision was supplied. A successful initial download therefore did not establish offline reload. The browser app loads the two known Qwen tokenizer files directly from the pinned revision, validates them before caching, and constructs `Qwen2Tokenizer`. Model weights use the pinned `AutoModelForCausalLM` loader. The cache uses full pinned URLs and remains covered by model-specific removal; no global cache or request interception is installed.

The matching ONNX asyncify module and WASM binary are bundled assets. Explicit `wasmPaths` overrides the library's CDN defaults. The service worker caches these assets on demand, so optional model loading does not force a runtime download when the writer first opens.
