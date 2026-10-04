# Editing and writing controls

Users can edit by keyboard, undo and redo, apply a writing correction, change writing preferences, and inspect optional help without enabling a model.

## Sub-features

- `history`: Imported content and separate documents retain independent undo and redo behavior.
- `selection`: Keyboard replacement changes only selected text and updates the word count.
- `review`: Applying a deterministic writing correction participates in history and recovery.
- `preferences`: Vim and dark-mode choices persist; focus mode and sidebar toggles preserve editable text.
- `optional-help`: Opening local writing help and Settings leaves writing usable without downloading a model.

## How to get to it (user POV)

Write in **Document editor** and use keyboard selection, undo, and redo. Open **Writing checks** and apply a suggestion in **Writing review**. Use **Vim mode**, **Dark mode**, **Focus mode**, and **Toggle documents**. Open **Local writing help**, then **Manage models in Settings**, to inspect optional assistance.

## Driving it with Playwright

Preconditions: `pnpm writer doctor` succeeds. Each scenario starts with an isolated browser context.

- **Edit and undo:** `pnpm writer verify editing` exercises normal undo/redo, independent document histories, keyboard selection, and exact text and word-count outcomes.
- **Apply a correction:** The same command changes `utilize` to `use`, checks undo and redo, reloads, and checks the recovered correction.
- **Change controls:** The same command verifies Vim insertion and undo, persisted Vim and dark-mode choices, and content preservation while toggling focus mode and the sidebar.
- **Inspect help:** The same command opens optional help and Settings, continues typing, checks saved text, and observes that model download requests are absent.

## Gotchas

- Vim insertion uses `i` and exits with `jj`; normal editing scenarios keep their own initial preferences.
- The optional-help check proves the observed no-download path, not inference or all model settings.
- The combined group runs every listed scenario; inspect the report to distinguish a failed control from the other passing paths.
