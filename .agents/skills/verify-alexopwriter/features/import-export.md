# Import and export

Users can import Markdown, edit it, rename it, download a copy, and import that copy without losing text or Unicode.

## Sub-features

- `edited-copy`: An imported document exports its revised text.
- `exact-roundtrip`: Renamed Unicode Markdown preserves filename and bytes through download and reimport.
- `reimport`: Importing the same file again restores its file baseline after editing.

## How to get to it (user POV)

Choose **Import file**, edit **Document editor**, optionally change **Document name**, then choose **Download copy**. Use **Import file** again to open the exported copy or reimport the original.

## Driving it with Playwright

Preconditions: `pnpm writer doctor` succeeds; scenarios supply their own temporary Markdown files.

- **Edit and export:** `pnpm writer verify import-export` imports a file, revises its text, downloads a copy, and compares the downloaded content.
- **Rename and roundtrip:** The same command renames Unicode Markdown, verifies the suggested filename and exact bytes, reimports the download, and verifies a second download.
- **Import again:** The same command reimports the original file after edits and checks the restored baseline in the editor and download. Inspect downloaded attachments in the report.

## Gotchas

- The harness uses the accessible **Import document** file input behind **Import file**. It does not automate native permission dialogs.
- **Open file** and **Save** are separate direct-access paths; these scenarios do not prove original-file overwrites or conflict dialogs.
- Compare exact bytes and filenames; a screenshot cannot detect missing trailing newlines or altered Unicode.
