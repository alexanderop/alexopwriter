import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, class: 'fs-md-h1' },
  { tag: tags.heading2, class: 'fs-md-h2' },
  { tag: tags.heading3, class: 'fs-md-h3' },
  { tag: tags.heading4, class: 'fs-md-h4' },
  { tag: tags.heading5, class: 'fs-md-h5' },
  { tag: tags.heading6, class: 'fs-md-h6' },
  { tag: tags.strong, class: 'fs-md-strong' },
  { tag: tags.emphasis, class: 'fs-md-em' },
  { tag: tags.monospace, class: 'fs-md-code' },
  { tag: tags.labelName, class: 'fs-md-code' },
  { tag: tags.link, class: 'fs-md-link' },
  { tag: tags.url, class: 'fs-md-url' },
  { tag: tags.quote, class: 'fs-md-quote' },
  { tag: tags.list, class: 'fs-md-list' },
  { tag: tags.processingInstruction, class: 'fs-md-mark' },
])
