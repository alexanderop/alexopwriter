import { createHtmlDocument } from '../html'
import type { DocumentExport, ExportSource } from '../domain/markdown'

export type PrintDocument = (frame: HTMLIFrameElement) => Promise<void>

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function browserPrint(frame: HTMLIFrameElement): Promise<void> {
  const target = frame.contentWindow
  if (!target) throw new Error('The print document could not be opened.')
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      window.clearTimeout(timeout)
      target.removeEventListener('afterprint', finish)
      resolve()
    }
    const timeout = window.setTimeout(finish, 300_000)
    target.addEventListener('afterprint', finish, { once: true })
    try {
      target.focus()
      target.print()
    } catch (error) {
      window.clearTimeout(timeout)
      target.removeEventListener('afterprint', finish)
      reject(error)
    }
  })
}

async function printDocument(html: string, print: PrintDocument): Promise<void> {
  const frame = document.createElement('iframe')
  frame.title = 'Print document'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:1000px;border:0'
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('The print document took too long to open.')),
        15_000,
      )
      frame.onload = () => {
        window.clearTimeout(timeout)
        resolve()
      }
      frame.srcdoc = html
      document.body.append(frame)
    })
    const content = frame.contentDocument
    if (!content) throw new Error('The print document could not be loaded.')
    await Promise.all([...content.images].map((image) => image.decode().catch(() => undefined)))
    await content.fonts.ready
    await print(frame)
  } finally {
    frame.remove()
  }
}

export function createBrowserDocumentExport(print: PrintDocument = browserPrint): DocumentExport {
  return {
    async export(source: ExportSource, format) {
      const filename =
        source.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_') || 'Document'
      if (format === 'print') {
        await printDocument(createHtmlDocument(source), print)
      } else if (format === 'html') {
        download(
          new Blob([createHtmlDocument(source)], { type: 'text/html;charset=utf-8' }),
          `${filename}.html`,
        )
      } else {
        const { createDocxDocument } = await import('../docx')
        const data = await createDocxDocument(source)
        download(
          new Blob([data], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          }),
          `${filename}.docx`,
        )
      }
    },
  }
}
