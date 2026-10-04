import { markdownLanguage } from '@codemirror/lang-markdown'

const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const embeddedImage = /^!\[((?:\\.|[^\\\]])*)\]\((data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2})\)$/u

export function clipboardImages(data: DataTransfer | null): File[] {
  return Array.from(data?.files ?? []).filter((file) => file.type.startsWith('image/'))
}

export async function encodeClipboardImages(files: readonly File[]): Promise<string> {
  const images = await Promise.all(files.map(async (file) => {
    if (!supportedTypes.has(file.type) || file.size === 0)
      throw new Error('Paste a PNG, JPEG, GIF, or WebP image.')
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The copied image could not be read.'))
      reader.onerror = () => reject(new Error('The copied image could not be read.'))
      reader.readAsDataURL(file)
    })
    const image = new Image()
    image.src = url
    try {
      await image.decode()
    } catch {
      throw new Error('The copied image could not be decoded. Try copying it again.')
    }
    return `![Pasted image](${url})`
  }))
  return images.join('\n\n')
}

export type EmbeddedImage = Readonly<{ from: number; to: number; alt: string; url: string }>
export function embeddedImages(text: string): EmbeddedImage[] {
  const images: EmbeddedImage[] = []
  if (!text.includes('data:image/')) return images
  markdownLanguage.parser.parse(text).iterate({
    enter(node) {
      if (node.name !== 'Image') return
      const match = embeddedImage.exec(text.slice(node.from, node.to))
      if (match?.[1] !== undefined && match[2])
        images.push({ from: node.from, to: node.to, alt: match[1].replace(/\\([\\[\]])/gu, '$1'), url: match[2] })
    },
  })
  return images
}

export function imageAwareWordCount(text: string): number {
  let end = 0
  const prose: string[] = []
  for (const image of embeddedImages(text)) {
    prose.push(text.slice(end, image.from))
    end = image.to
  }
  prose.push(text.slice(end))
  return prose.join(' ').trim().split(/\s+/u).filter(Boolean).length
}

export function imageMarkdown(alt: string, url: string): string {
  const escaped = alt.replace(/\r\n?|\n/gu, ' ').replace(/[\\[\]]/gu, '\\$&')
  return `![${escaped}](${url})`
}

export type ImageTarget = Readonly<{ id: symbol; documentId: string; original: string; url: string; alt: string }>
