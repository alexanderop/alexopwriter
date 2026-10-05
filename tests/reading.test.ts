import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { renderDocument } from '../src/features/reading'
import { createHtmlDocument } from '../src/features/reading/html'
import { createDocxDocument } from '../src/features/reading/docx'

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII='

function unzip(data: ArrayBuffer): Map<string, Buffer> {
  const buffer = Buffer.from(data)
  const entries = new Map<string, Buffer>()
  for (let position = 0; position < buffer.length - 46; position++) {
    if (buffer.readUInt32LE(position) !== 0x02014b50) continue
    const compression = buffer.readUInt16LE(position + 10)
    const size = buffer.readUInt32LE(position + 20)
    const nameSize = buffer.readUInt16LE(position + 28)
    const name = buffer.subarray(position + 46, position + 46 + nameSize).toString()
    const local = buffer.readUInt32LE(position + 42)
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    const compressed = buffer.subarray(start, start + size)
    entries.set(name, compression === 8 ? inflateRawSync(compressed) : compressed)
  }
  return entries
}

describe('reading document', () => {
  it('renders Markdown blocks and stable headings with source offsets across CRLF and fenced code', () => {
    const text =
      '# One *thing*\r\n\r\n```md\r\n# Hidden\r\n```\r\n\r\n## One thing\r\n\r\nTitle\r\n=====\r\n\r\n| A | B |\r\n| - | - |\r\n| 1 | 2 |'
    const result = renderDocument(text)
    expect(result.headings).toEqual([
      { id: 'one-thing', text: 'One thing', level: 1, from: 0, to: text.indexOf('\r\n') + 2 },
      {
        id: 'one-thing-2',
        text: 'One thing',
        level: 2,
        from: text.indexOf('## One'),
        to: text.indexOf('## One') + '## One thing\r\n'.length,
      },
      {
        id: 'title',
        text: 'Title',
        level: 1,
        from: text.indexOf('Title'),
        to: text.indexOf('=====') + 7,
      },
    ])
    expect(result.html).toContain('<h1 id="one-thing">One <em>thing</em></h1>')
    expect(result.html).toContain('<code class="language-md"># Hidden')
    expect(result.html).toContain('<table>')
  })

  it('prevents unsafe HTML, protocols and automatic external image requests', () => {
    const result = renderDocument(
      [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '[a](javascript:alert%281%29)',
        '[b](vbscript:run)',
        '[c](data:text/html,attack)',
        '[relative](./other.md)',
        '[protocol](//example.com/path)',
        '[escaped](java&#x73;cript:alert%281%29)',
        '![secret](https://tracking.example/pixel)',
        '![svg](data:image/svg+xml;base64,PHN2Zz4=)',
        '![local](file:///private/secret)',
        '[safe](https://example.com)',
        `[email](mailto:writer@example.com) ![dot](${png})`,
      ].join('\n\n'),
    )
    expect(result.html).not.toMatch(
      /<(?:script|iframe)\b|<img[^>]+(?:https:|file:|svg\+xml)|href="(?:javascript|vbscript|data|\.\/|\/\/)/i,
    )
    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(result.html).toContain('[Image: secret]')
    expect(result.html).toContain(`src="${png}" alt="dot"`)
    expect(result.html).toContain('href="https://example.com" rel="noopener noreferrer"')
    expect(result.html).toContain('href="mailto:writer@example.com"')
  })

  it('escapes the standalone title and carries restrictive content policy and styles', () => {
    const html = createHtmlDocument({ name: '</title><script>attack()</script>', text: '# Safe' })
    expect(html).toContain('<title>&lt;/title&gt;&lt;script&gt;attack()&lt;/script&gt;</title>')
    expect(html).toContain("default-src 'none'; img-src data:")
    expect(html).toContain('@media print')
    expect(html).not.toContain('<script>')
  })
})

it('exports a real DOCX with semantic headings, formatting, numbering, hyperlinks, tables and embedded raster', async () => {
  const data = await createDocxDocument({
    name: 'A document',
    text: `# Title\n\nA **bold** and *emphasized* [link](https://example.com).\n\n3. Third\n4. Fourth\n\n- Bullet\n\n| Name | Value |\n| - | - |\n| One | Two |\n\n![Tiny dot](${png})\n\n![Remote](https://tracking.example/image.png)`,
  })
  const zip = unzip(data)
  const document = zip.get('word/document.xml')?.toString() ?? ''
  const relations = zip.get('word/_rels/document.xml.rels')?.toString() ?? ''
  const numbering = zip.get('word/numbering.xml')?.toString() ?? ''
  expect(document).toContain('w:val="Heading1"')
  expect(document).toContain('Title')
  expect(document).toContain('<w:b/>')
  expect(document).toContain('<w:i/>')
  expect(document).toContain('<w:numPr>')
  expect(document).toContain('<w:tbl>')
  expect(document).toContain('Tiny dot')
  expect(document).toContain('[Image: Remote]')
  expect(relations).toContain('Target="https://example.com"')
  expect(relations).not.toContain('tracking.example')
  expect(numbering).toContain('w:start w:val="3"')
  expect(numbering).toContain('w:val="bullet"')
  expect(
    [...zip.keys()].some((name) => name.startsWith('word/media/') && name.endsWith('.png')),
  ).toBe(true)
})
