# Portable images and descriptions

Pasted images stay in the document through recovery and export. Users can write alt text manually without enabling a local model.

## Sub-features

- `image-roundtrip`: Image content survives reload, download, and reimport with original bytes.
- `manual-description`: Alt text survives reload and appears in the downloaded Markdown.
- `no-model-download`: Manual description editing does not request a model download.

## How to get to it (user POV)

Focus **Document editor** and paste an image. Choose **Edit alt text**, enter a description in **Alt text**, and choose **Apply alt text**. Reload to recover the document or use **Download copy** and **Import file** to move it.

## Driving it with Playwright

Preconditions: `pnpm writer doctor` succeeds. Scenarios provide a small PNG; no model installation is needed.

- **Paste and roundtrip:** `pnpm writer verify images` dispatches an image paste event, checks the displayed image, reloads, downloads and reimports, then checks the original image data and rendered width.
- **Describe manually:** The same command applies manual alt text, checks visible image description and model-request observations, reloads, and checks the description in the downloaded Markdown. Inspect the action trace and download attachments.

## Gotchas

- Paste is a synthetic browser event with image file data. This proves the application's paste handling, not the operating-system clipboard or native clipboard permissions.
- Automatic image descriptions and inference quality are outside this group and require the separate opt-in model workflow.
- A visible image alone does not prove portable bytes or recovered alt text; retain the roundtrip and download assertions.
