import { escapeHtml, renderDocument, type ExportSource } from './domain/markdown'

export const readingStyles = `
.reading-content { overflow-wrap: anywhere; line-height: 1.75; }
.reading-content h1, .reading-content h2, .reading-content h3,
.reading-content h4, .reading-content h5, .reading-content h6 { line-height: 1.3; margin: 1.5em 0 .6em; }
.reading-content > :first-child { margin-top: 0; }
.reading-content img { max-width: 100%; height: auto; }
.reading-content pre { overflow-x: auto; padding: 1em; background: var(--panel, #f3f3f3); border-radius: 4px; }
.reading-content code { font-family: var(--font-mono, monospace); font-size: .9em; }
.reading-content blockquote { border-inline-start: 3px solid var(--line, #ccc); margin-inline: 0; padding-inline-start: 1em; color: var(--muted, #555); }
.reading-content table { border-collapse: collapse; display: block; max-width: 100%; overflow-x: auto; }
.reading-content th, .reading-content td { border: 1px solid var(--line, #ccc); padding: .45em .8em; }
.reading-content a { color: var(--accent, #245a91); text-decoration: underline; }
.reading-content hr { border: 0; border-top: 1px solid var(--line, #ccc); margin: 2em 0; }
.reading-image-placeholder { color: var(--muted, #555); font-style: italic; }
@media print {
  .reading-content pre { white-space: pre-wrap; }
  .reading-content table { display: table; width: 100%; }
  .reading-content h1, .reading-content h2, .reading-content h3 { break-after: avoid; }
  .reading-content img, .reading-content tr { break-inside: avoid; }
  @page { margin: 20mm; }
}`

export function createHtmlDocument(source: ExportSource): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(source.name)}</title>
<style>body { margin: 0 auto; padding: 3rem 1.5rem; max-width: 46rem; color: #222; background: white; font: 18px Georgia, serif; }${readingStyles}</style>
</head><body><article class="reading-content">${renderDocument(source.text).html}</article></body></html>`
}
