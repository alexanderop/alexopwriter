# alexopwriter verification map

Use these recipes from the repository root. Run `pnpm writer doctor` first; each `pnpm writer verify <feature>` then builds and starts its own production app, drives isolated Playwright browser contexts, and cleans up. No seed data or account is required. Add `--browser firefox` for Firefox or `--headed` to observe the run.

Proof lives in the printed `verification-artifacts/run-*/` directory after cleanup. Require passing scenario assertions, inspect action traces and resulting screenshots, and inspect downloaded attachments where relevant. Report a failed or untested entry point explicitly; another passing path does not establish it. `verify all` covers these five groups, excluding native OS dialogs, real OS clipboard integration, and model inference.

| Feature                               | User paths and proof                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [Recovery](recovery.md)               | New/imported documents, empty drafts, names, independent documents, and divergent tabs survive reload. |
| [Import and export](import-export.md) | Import file, document naming, Download copy, and reimport preserve exact text and filenames.           |
| [Offline writing](offline.md)         | Reload and writing still work after the browser loses network access.                                  |
| [Images](images.md)                   | Pasted image data and manual alt text survive reload, download, and reimport.                          |
| [Editing](editing.md)                 | Keyboard selection, undo/redo, review corrections, preferences, and optional help remain usable.       |

The map describes current scenario coverage. When a user-facing entry point changes, update its scenario, shared page object, and map together. Each feature file uses the same four sections so later maintenance can compare entry points with proof.

If the behavior has no mapped scenario, use the [Playwright CLI exploration workflow](../references/exploration.md). Record the exploratory result separately from automated suite results.
