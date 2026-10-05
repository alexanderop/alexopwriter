# Draft recovery

Writing and document names remain available after reload, including empty drafts and independent edits from multiple tabs.

## Sub-features

- `reload`: A new draft survives reload with Unicode intact.
- `documents`: Two imported documents retain independent edits across repeated reloads.
- `empty`: Clearing a document remains empty after reload and download.
- `branches`: Divergent edits from two tabs both appear in a fresh tab.
- `rename`: A renamed document and multiline keyboard edits recover exactly.

## How to get to it (user POV)

Use **New document** or **Import file**, write in **Document editor**, and wait for **Draft saved in browser**. Switch documents through the **Documents** sidebar. Edit **Document name** to rename. Reload the app or open another tab at the same address to recover drafts.

## Driving it with Playwright

Preconditions: `pnpm writer doctor` succeeds; no existing personal drafts are needed.

- **Create and reload:** `pnpm writer verify recovery` writes a new draft, waits for the saved status, reloads, and checks exact text.
- **Switch, clear, and rename:** The same command verifies independent documents through repeated reloads, an empty recovered download, and exact renamed multiline text and downloaded bytes.
- **Divergent tabs:** The same command edits a shared draft in two tabs and checks both recovered branches in a fresh tab. Inspect those actions in the retained trace.

The library journey verifies a favorite and folder assignment through Trash, restore, and reload. Browser Mode also covers restoring the only document and removing the last document from a selected folder.

## Gotchas

- Browser recovery is separate from writing back to a disk file. These results prove recovered drafts, not original-file saving.
- Two-tab scenarios intentionally share a browser context; separate scenarios do not.
- Wait for the saved status before reload. An action without a post-reload assertion is insufficient proof.
