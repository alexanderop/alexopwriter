# Writing upgrade design

## Caller's view

The app passes writing preferences to DocumentEditor and keeps it mounted while showing preview. Editor commands expose search, focus, and heading selection without exposing CodeMirror objects. Workspace commands update library metadata through the same recovery protocol as text. Reading accepts a document name and Markdown text, then renders or exports that snapshot.

## Data and ownership

- Editor preferences describe font, size, line width, spelling language, passage focus, and typewriter behavior. Vim remains its existing separate persisted option with a new default of off. Reconfigure cached editor states when activating them.
- Library metadata adds folder, favorite, trash timestamp, and modification time to document recovery. Missing fields in old records receive defaults. Metadata changes do not make disk text dirty. Restore deduplication includes metadata and preserves competing branches.
- The reading feature owns safe Markdown rendering, heading offsets, HTML, and DOCX generation. Its browser adapter owns downloads and print. Raw HTML is disabled. Preview accepts source Markdown rather than caller-supplied HTML.
- The app owns quiet mode, write/split/read view, preference persistence, quick navigation, and shortcut help. Shared UI owns the native select wrapper.

## Synthesis

Candidate A is the base because it preserves the editor and recovery owners. Candidate C contributes a dedicated reading feature and shared parse policy for preview and output. Candidate B's separate metadata operation store would require stable recovery-lineage identities and two-store coordination. That complexity does not improve this scope, so it is rejected. Its warnings about metadata changes and restored sibling identities become regression cases.

Three independent candidates used the inherited model. No alternate model family is available, so this does not establish model diversity. Candidate sources and the judge's verdict are retained in verification artifacts.

## Accepted tradeoffs

Folders organize browser drafts and do not create disk directories. Trash is recoverable and does not delete disk files. Native browser spellcheck uses available dictionaries. PDF saving uses the browser print dialog. DOCX is generated locally. Preference persistence may fail without preventing writing; document persistence failures remain visible.

## Verification

Pure rules and document transitions use logic tests. Real editor selection, undo, scrolling, and IndexedDB use Browser Mode. Built journeys cover wiring, reload, offline use, downloads, and keyboard navigation. Inspect desktop and narrow-screen screenshots. Independently review the final diff before main delivery.
