import {
  Bookmark,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  type ParagraphChild,
  type ILevelsOptions,
} from 'docx'
import type { Token } from 'markdown-it'
import { embeddedRaster, isSafeLink, parseDocument, type ExportSource } from './domain/markdown'

const headingLevels = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const

function imageRun(token: Token): ImageRun | TextRun {
  const match = embeddedRaster(String(token.attrGet('src') ?? ''))
  const format = match?.[1]?.toLowerCase()
  if (!match?.[2] || (format !== 'png' && format !== 'jpeg' && format !== 'gif')) {
    return new TextRun(`[Image: ${token.content || 'image'}]`)
  }
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0))
  let width = 480
  let height = 320
  const view = new DataView(bytes.buffer)
  if (format === 'png' && bytes.length >= 24) {
    width = view.getUint32(16)
    height = view.getUint32(20)
  } else if (format === 'gif' && bytes.length >= 10) {
    width = view.getUint16(6, true)
    height = view.getUint16(8, true)
  }
  if (format === 'jpeg') {
    for (let position = 2; position + 8 < bytes.length;) {
      if (bytes[position] !== 0xff) break
      const marker = bytes[position + 1] ?? 0
      if (marker === 0xda || marker === 0xd9) break
      const length = view.getUint16(position + 2)
      if (length < 2 || position + length + 2 > bytes.length) break
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      ) {
        height = view.getUint16(position + 5)
        width = view.getUint16(position + 7)
        break
      }
      position += length + 2
    }
  }
  const scale = Math.min(1, 480 / Math.max(1, width), 640 / Math.max(1, height))
  return new ImageRun({
    type: format === 'jpeg' ? 'jpg' : format,
    data: bytes,
    transformation: { width: Math.max(1, width * scale), height: Math.max(1, height * scale) },
    altText: { name: token.content, title: token.content, description: token.content },
  })
}

function inlineRuns(tokens: readonly Token[]): ParagraphChild[] {
  const result: ParagraphChild[] = []
  let bold = false
  let italics = false
  let strike = false
  let link: { href: string; children: TextRun[] } | undefined
  const addText = (text: string, code = false, lineBreak = false) => {
    const run = new TextRun({
      text,
      bold,
      italics,
      strike,
      ...(code ? { font: 'Courier New' } : {}),
      ...(lineBreak ? { break: 1 } : {}),
    })
    if (link) link.children.push(run)
    else result.push(run)
  }
  for (const token of tokens) {
    switch (token.type) {
      case 'strong_open':
        bold = true
        break
      case 'strong_close':
        bold = false
        break
      case 'em_open':
        italics = true
        break
      case 'em_close':
        italics = false
        break
      case 's_open':
        strike = true
        break
      case 's_close':
        strike = false
        break
      case 'link_open':
        link = { href: String(token.attrGet('href') ?? ''), children: [] }
        break
      case 'link_close':
        if (link) {
          if (link.href.startsWith('#'))
            result.push(
              new InternalHyperlink({ anchor: link.href.slice(1), children: link.children }),
            )
          else if (isSafeLink(link.href))
            result.push(new ExternalHyperlink({ link: link.href, children: link.children }))
          else result.push(...link.children)
          link = undefined
        }
        break
      case 'image':
        result.push(imageRun(token))
        break
      case 'softbreak':
        addText(' ')
        break
      case 'hardbreak':
        addText('', false, true)
        break
      case 'code_inline':
        addText(token.content, true)
        break
      default:
        if (token.nesting === 0) addText(token.content)
    }
  }
  return result
}

type List = { reference: string; level: number; firstParagraph: boolean }

export async function createDocxDocument(source: ExportSource): Promise<ArrayBuffer> {
  const { tokens } = parseDocument(source.text)
  const children: (Paragraph | Table)[] = []
  const numbering: { reference: string; levels: ILevelsOptions[] }[] = []
  const lists: List[] = []
  let quoteDepth = 0
  let tableRows: TableRow[] | undefined
  let tableCells: TableCell[] = []
  let cellParagraphs: Paragraph[] | undefined
  let tableHeader = false
  let heading: (typeof headingLevels)[number] | undefined
  let headingId: string | undefined
  const appendParagraph = (runs: ParagraphChild[]) => {
    const list = lists.at(-1)
    const paragraph = new Paragraph({
      children: headingId ? [new Bookmark({ id: headingId, children: runs })] : runs,
      ...(heading ? { heading } : {}),
      ...(list?.firstParagraph
        ? { numbering: { reference: list.reference, level: list.level } }
        : {}),
      ...(quoteDepth > 0 ? { indent: { left: quoteDepth * 360 } } : {}),
      spacing: { after: 160 },
    })
    if (list) list.firstParagraph = false
    if (cellParagraphs) cellParagraphs.push(paragraph)
    else children.push(paragraph)
  }
  for (const token of tokens) {
    switch (token.type) {
      case 'heading_open':
        heading = headingLevels[Number(token.tag.slice(1)) - 1]
        headingId = String(token.attrGet('id') ?? '') || undefined
        break
      case 'heading_close':
        heading = undefined
        headingId = undefined
        break
      case 'inline':
        appendParagraph(inlineRuns(token.children ?? []))
        break
      case 'fence':
      case 'code_block':
        appendParagraph(
          token.content
            .replace(/\n$/, '')
            .split('\n')
            .map(
              (line, index) =>
                new TextRun({ text: line, font: 'Courier New', ...(index ? { break: 1 } : {}) }),
            ),
        )
        break
      case 'blockquote_open':
        quoteDepth++
        break
      case 'blockquote_close':
        quoteDepth--
        break
      case 'ordered_list_open':
      case 'bullet_list_open': {
        const reference = `list-${numbering.length + 1}`
        const level = Math.min(lists.length, 8)
        const ordered = token.type === 'ordered_list_open'
        numbering.push({
          reference,
          levels: [
            {
              level,
              format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
              text: ordered ? `%${level + 1}.` : '•',
              start: Number(token.attrGet('start') ?? 1),
              style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
            },
          ],
        })
        lists.push({ reference, level, firstParagraph: true })
        break
      }
      case 'ordered_list_close':
      case 'bullet_list_close':
        lists.pop()
        break
      case 'list_item_open': {
        const list = lists.at(-1)
        if (list) list.firstParagraph = true
        break
      }
      case 'table_open':
        tableRows = []
        break
      case 'thead_open':
        tableHeader = true
        break
      case 'thead_close':
        tableHeader = false
        break
      case 'tr_open':
        tableCells = []
        break
      case 'th_open':
      case 'td_open':
        cellParagraphs = []
        break
      case 'th_close':
      case 'td_close':
        tableCells.push(
          new TableCell({
            children: cellParagraphs?.length ? cellParagraphs : [new Paragraph('')],
          }),
        )
        cellParagraphs = undefined
        break
      case 'tr_close':
        tableRows?.push(new TableRow({ children: tableCells, tableHeader }))
        break
      case 'table_close':
        if (tableRows) children.push(new Table({ rows: tableRows }))
        tableRows = undefined
        break
      case 'hr':
        children.push(new Paragraph({ text: '―'.repeat(20) }))
        break
    }
  }
  return Packer.toArrayBuffer(
    new Document({
      title: source.name,
      creator: 'alexopwriter',
      numbering: { config: numbering },
      sections: [{ children: children.length ? children : [new Paragraph('')] }],
    }),
  )
}
