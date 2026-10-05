import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { DocumentPreview } from '../src/features/reading/ui'
import { createBrowserDocumentExport } from '../src/features/reading/adapters/browserExport'

it('renders a safe reading surface from source and updates when the source changes', async () => {
  const screen = await render(DocumentPreview, {
    props: {
      name: 'Essay',
      text: '# First\n\n**Strong** <script>bad()</script>\n\n![Remote](https://example.com/tracker.png)',
    },
  })
  await expect.element(screen.getByRole('heading', { name: 'First' })).toBeVisible()
  expect(screen.getByRole('article', { name: 'Preview of Essay' }).element().textContent).toContain(
    '<script>bad()</script>',
  )
  expect(screen.container.querySelector('script, img')).toBeNull()
  await screen.rerender({ text: '## Second' })
  await expect.element(screen.getByRole('heading', { name: 'Second' })).toBeVisible()
  screen.unmount()
})

it('loads an isolated print document and retains it until the print capability finishes', async () => {
  let release: (() => void) | undefined
  let frame: HTMLIFrameElement | undefined
  const exporter = createBrowserDocumentExport(async (loadedFrame) => {
    frame = loadedFrame
    expect(loadedFrame.contentDocument?.querySelector('h1')?.textContent).toBe('Printed essay')
    expect(loadedFrame.contentDocument?.querySelector('script, img')).toBeNull()
    expect(loadedFrame.sandbox.contains('allow-scripts')).toBe(false)
    await new Promise<void>((resolve) => {
      release = resolve
    })
  })
  const pending = exporter.export(
    { name: 'Print', text: '# Printed essay\n\n![external](https://example.com/image.png)' },
    'print',
  )
  await expect.poll(() => frame?.isConnected).toBe(true)
  expect(frame?.contentDocument?.title).toBe('Print')
  release?.()
  await pending
  expect(frame?.isConnected).toBe(false)
})

it('removes the print frame when the print capability fails', async () => {
  const exporter = createBrowserDocumentExport(async () => {
    throw new Error('Print unavailable')
  })
  await expect(exporter.export({ name: 'Print', text: '# Text' }, 'print')).rejects.toThrow(
    'Print unavailable',
  )
  expect(document.querySelector('iframe[title="Print document"]')).toBeNull()
})
