import { expect, it } from 'vitest'
import { createBrowserDocxDocument } from '../src/features/reading/adapters/browserExport'

async function unzip(data: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const view = new DataView(data)
  const entries = new Map<string, Uint8Array>()
  for (let position = 0; position < data.byteLength - 46; position++) {
    if (view.getUint32(position, true) !== 0x02014b50) continue
    const compression = view.getUint16(position + 10, true)
    const size = view.getUint32(position + 20, true)
    const nameSize = view.getUint16(position + 28, true)
    const name = new TextDecoder().decode(new Uint8Array(data, position + 46, nameSize))
    const local = view.getUint32(position + 42, true)
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const bytes = data.slice(start, start + size)
    const contents =
      compression === 8
        ? await new Response(
            new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')),
          ).arrayBuffer()
        : bytes
    entries.set(name, new Uint8Array(contents))
  }
  return entries
}

it('converts embedded WebP images into real PNG media in Word without rewriting prose or alt text', async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 3
  canvas.height = 2
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Test requires a real browser canvas')
  context.fillStyle = '#ff0000'
  context.fillRect(0, 0, 3, 2)
  const webp = canvas.toDataURL('image/webp')
  expect(webp).toMatch(/^data:image\/webp;base64,/)
  const text = `The original URL is ${webp}\n\n![${webp}](${webp})\n\n![Repeated image](${webp})\n\n\`${webp}\`\n\n![Remote](https://tracking.example/image.webp)`
  const source = { name: 'WebP document', text }
  const archive = await unzip(await createBrowserDocxDocument(source))
  const xml = new TextDecoder().decode(archive.get('word/document.xml'))
  expect(source.text).toBe(text)
  expect(xml).toContain(`The original URL is ${webp}`)
  expect(xml).toContain(`descr="${webp}"`)
  expect(xml).toContain('descr="Repeated image"')
  expect(xml.match(/<w:drawing>/g)).toHaveLength(2)
  expect(xml).toContain('[Image: Remote]')
  const media = [...archive].filter(
    ([name]) => name.startsWith('word/media/') && name.endsWith('.png'),
  )
  expect(media).toHaveLength(1)
  const png = media[0]?.[1]
  expect(png?.slice(0, 8)).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))
  if (!png) throw new Error('PNG media missing')
  const dimensions = new DataView(png.buffer, png.byteOffset, png.byteLength)
  expect(dimensions.getUint32(16)).toBe(3)
  expect(dimensions.getUint32(20)).toBe(2)
  const relations = new TextDecoder().decode(archive.get('word/_rels/document.xml.rels'))
  expect(relations).not.toContain('tracking.example')
})

it('reports an undecodable embedded WebP instead of silently dropping it', async () => {
  await expect(
    createBrowserDocxDocument({
      name: 'Broken image',
      text: '![Broken](data:image/webp;base64,YmFk)',
    }),
  ).rejects.toThrow('An embedded WebP image could not be converted for Word export.')
})
