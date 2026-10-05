import MarkdownIt from 'markdown-it'
import type { Token } from 'markdown-it'

export type DocumentHeading = Readonly<{
  id: string
  text: string
  level: number
  from: number
  to: number
}>
export type ReadingDocument = Readonly<{ html: string; headings: readonly DocumentHeading[] }>
export type ExportSource = Readonly<{ name: string; text: string }>
export type ExportFormat = 'html' | 'print' | 'docx'
export interface DocumentExport {
  export(source: ExportSource, format: ExportFormat): Promise<void>
}

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false })
export const escapeHtml = (value: string) => markdown.utils.escapeHtml(value)
export const isSafeLink = (url: string): boolean => /^(?:https?:\/\/|mailto:|#)/i.test(url)
export const embeddedRaster = (url: string): RegExpMatchArray | null =>
  url.match(
    /^data:image\/(png|jpeg|gif|webp);base64,((?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?)$/i,
  )

function inlineText(tokens: readonly Token[]): string {
  return tokens
    .map((token) => {
      if (token.type === 'image') return token.content
      if (token.type === 'softbreak' || token.type === 'hardbreak') return ' '
      return token.children ? inlineText(token.children) : token.nesting === 0 ? token.content : ''
    })
    .join('')
}

function secureTokens(tokens: Token[]): void {
  for (const token of tokens) {
    if (token.type === 'link_open') {
      const href = String(token.attrGet('href') ?? '')
      if (isSafeLink(href)) token.attrSet('rel', 'noopener noreferrer')
      else token.attrSet('href', '#')
    }
    if (token.children) secureTokens(token.children)
  }
}

markdown.renderer.rules.image = (tokens, index) => {
  const token = tokens[index]
  if (!token) return ''
  const source = String(token.attrGet('src') ?? '')
  const alt = escapeHtml(inlineText(token.children ?? []) || token.content)
  if (!embeddedRaster(source)) {
    return `<span class="reading-image-placeholder">[Image: ${alt || 'external image'}]</span>`
  }
  return `<img src="${escapeHtml(source)}" alt="${alt}" />`
}

export function parseDocument(text: string): { tokens: Token[]; headings: DocumentHeading[] } {
  const tokens = markdown.parse(text, {})
  secureTokens(tokens)
  const offsets = [0]
  for (const match of text.matchAll(/\r\n|\n|\r/g)) offsets.push(match.index + match[0].length)
  const headings: DocumentHeading[] = []
  const ids = new Set<string>()
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token?.type !== 'heading_open' || !token.map) continue
    const title = inlineText(tokens[index + 1]?.children ?? [])
    const slug =
      title
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .trim()
        .replace(/\s+/g, '-') || 'heading'
    let id = slug
    let suffix = 2
    while (ids.has(id)) id = `${slug}-${suffix++}`
    ids.add(id)
    token.attrSet('id', id)
    headings.push({
      id,
      text: title,
      level: Number(token.tag.slice(1)),
      from: offsets[token.map[0]] ?? text.length,
      to: offsets[token.map[1]] ?? text.length,
    })
  }
  return { tokens, headings }
}

export function renderDocument(text: string): ReadingDocument {
  const { tokens, headings } = parseDocument(text)
  return { html: markdown.renderer.render(tokens, markdown.options, {}), headings }
}
