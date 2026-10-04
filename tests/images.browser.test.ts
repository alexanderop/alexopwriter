import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, ref } from 'vue'
import { DocumentEditor } from '../src/features/editor/ui'
import { encodeClipboardImages, type ImageTarget } from '../src/features/editor/images'
import { browserFiles } from '../src/features/documents/adapters/browserFiles'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='
const markup = `![Pasted image](data:image/png;base64,${png})`
const file = () => new File([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], 'image.png', { type: 'image/png' })
function paste(files: File[]) {
  const data = new DataTransfer()
  files.forEach((image) => data.items.add(image))
  document.querySelector('[aria-label="Document editor"]')?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
}
async function harness(encodeImages = encodeClipboardImages, text = '') {
  const texts = ref<Record<string, string>>({ a: text, b: 'Second' })
  const error = ref('')
  const imageTarget = ref<ImageTarget | null>(null)
  const id = ref('a')
  const editor = ref<InstanceType<typeof DocumentEditor> | null>(null)
  const mounted = await render(defineComponent({
    components: { DocumentEditor },
    setup: () => ({ texts, error, id, encodeImages, editor, imageTarget }),
    template: `<DocumentEditor ref="editor" :document-id="id" :text="texts[id] || ''" :revision="0" :vim-enabled="false" :encode-images="encodeImages" @change="(key, text) => texts[key] = text" @error="error = $event.message" @image="imageTarget = $event" /><output aria-label="Paste error">{{ error }}</output>`,
  }))
  return { texts, error, id, editor, mounted, imageTarget }
}
const modifier = navigator.platform.includes('Mac') ? 'Meta' : 'Control'

test('real image decoding inserts ordered images as one undoable edit and atomic deletion', async () => {
  const { texts } = await harness()
  await page.getByRole('textbox').click()
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 2
  const secondBlob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), 'image/png'))
  const secondFile = new File([secondBlob], 'second.png', { type: 'image/png' })
  const secondMarkup = await encodeClipboardImages([secondFile])
  paste([file(), secondFile])
  await expect.poll(() => texts.value['a']).toBe(`${markup}\n\n${secondMarkup}`)
  await expect.element(page.getByRole('img').first()).toBeVisible()
  expect((page.getByRole('img').first().element() as HTMLImageElement).naturalWidth).toBe(1)
  await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
  await expect.poll(() => texts.value['a']).toBe('')
  await userEvent.keyboard(`{${modifier}>}{Shift>}z{/Shift}{/${modifier}}`)
  await expect.poll(() => texts.value['a']).toBe(`${markup}\n\n${secondMarkup}`)
  await userEvent.keyboard('{ArrowRight}{Backspace}')
  await expect.poll(() => texts.value['a']).toBe(`${markup}\n\n`)
})

test('ordinary text paste retains native CodeMirror behavior', async () => {
  const { texts } = await harness()
  await page.getByRole('textbox').click()
  const data = new DataTransfer()
  data.setData('text/plain', 'Ordinary words')
  document.querySelector('[aria-label="Document editor"]')?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  await expect.poll(() => texts.value['a']).toBe('Ordinary words')
})

test('pending images follow their original document and mapped edits', async () => {
  let finish: (value: string) => void = () => undefined
  const { texts, id } = await harness(() => new Promise((resolve) => { finish = resolve }))
  await page.getByRole('textbox').click()
  paste([file()])
  await userEvent.keyboard('Before ')
  id.value = 'b'
  await expect.element(page.getByRole('textbox')).toHaveTextContent('Second')
  finish(markup)
  await expect.poll(() => texts.value['a']).toBe(`Before ${markup}`)
  expect(texts.value['b']).toBe('Second')
  id.value = 'a'
  await expect.element(page.getByRole('img')).toBeVisible()
})

test('changing a pending selected passage cancels image replacement', async () => {
  let finish: (value: string) => void = () => undefined
  const { texts, editor, error } = await harness(() => new Promise((resolve) => { finish = resolve }), 'Original')
  editor.value?.selectRange(0, 8)
  paste([file()])
  await userEvent.keyboard('Newer')
  finish(markup)
  await expect.poll(() => error.value).toContain('selected passage changed')
  expect(texts.value['a']).toBe('Newer')
})

test('delayed image completion preserves a moved caret for subsequent typing', async () => {
  let finish: (value: string) => void = () => undefined
  const { texts, editor } = await harness(() => new Promise((resolve) => { finish = resolve }), 'Before After')
  editor.value?.selectRange(0, 0)
  paste([file()])
  editor.value?.selectRange(7, 7)
  finish(markup)
  await expect.poll(() => texts.value['a']).toBe(`${markup}Before After`)
  await userEvent.keyboard('New ')
  await expect.poll(() => texts.value['a']).toBe(`${markup}Before New After`)
})

test('delayed image completion preserves a newer selected passage for subsequent typing', async () => {
  let finish: (value: string) => void = () => undefined
  const { texts, editor } = await harness(() => new Promise((resolve) => { finish = resolve }), 'Before After')
  editor.value?.selectRange(0, 6)
  paste([file()])
  editor.value?.selectRange(7, 12)
  finish(markup)
  await expect.poll(() => texts.value['a']).toBe(`${markup} After`)
  await userEvent.keyboard('Newer')
  await expect.poll(() => texts.value['a']).toBe(`${markup} Newer`)
})

test('invalid image bytes and unsupported formats report errors without modifying prose', async () => {
  const { texts, error } = await harness(encodeClipboardImages, 'Keep')
  paste([new File(['invalid'], 'bad.png', { type: 'image/png' })])
  await expect.poll(() => error.value).toContain('could not be decoded')
  paste([new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' })])
  await expect.poll(() => error.value).toContain('PNG, JPEG, GIF, or WebP')
  expect(texts.value['a']).toBe('Keep')
})

test('unmounted editors ignore late image completion', async () => {
  let finish: (value: string) => void = () => undefined
  const { texts, mounted } = await harness(() => new Promise((resolve) => { finish = resolve }))
  paste([file()])
  await mounted.unmount()
  finish(markup)
  await Promise.resolve()
  expect(texts.value['a']).toBe('')
})

test('native save and reopen preserve exact embedded image data through a real file handle', async () => {
  const root = await navigator.storage.getDirectory()
  const name = `image-${crypto.randomUUID()}.md`
  const handle = await root.getFileHandle(name, { create: true })
  try {
    const access = browserFiles({ open: async () => [handle], save: async () => handle })
    const binding = await access.saveAs(name)
    await binding?.write(markup)
    expect(await (await handle.getFile()).text()).toBe(markup)
    expect((await access.open())?.text).toBe(markup)
  } finally { await root.removeEntry(name) }
})

test('typing after paste follows the image and long image destinations render', async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')!
  const pixels = context.createImageData(256, 256)
  let seed = 7391
  for (let index = 0; index < pixels.data.length; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0
    pixels.data[index] = seed >>> 24
  }
  context.putImageData(pixels, 0, 0)
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), 'image/png'))
  expect(blob.size).toBeGreaterThan(100_000)
  const { texts } = await harness()
  await page.getByRole('textbox').click()
  paste([new File([blob], 'large.png', { type: 'image/png' })])
  await expect.element(page.getByRole('img')).toBeVisible()
  await userEvent.keyboard('After')
  await expect.poll(() => texts.value['a']?.endsWith(')After')).toBe(true)
})

test('a replacement spanning a pending caret cancels insertion', async () => {
  let finish: (value: string) => void = () => undefined
  const { editor, texts, error } = await harness(() => new Promise((resolve) => { finish = resolve }), 'Original')
  editor.value?.selectRange(4, 4)
  paste([file()])
  editor.value?.selectRange(0, 8)
  await userEvent.keyboard('Newer')
  finish(markup)
  await expect.poll(() => error.value).toContain('selected passage changed')
  expect(texts.value['a']).toBe('Newer')
})

test('returning to a document before its paste completes clears the update guard', async () => {
  let finish: (value: string) => void = () => undefined
  const { id, editor } = await harness(() => new Promise((resolve) => { finish = resolve }))
  paste([file()])
  expect(editor.value?.hasPendingImages()).toBe(true)
  id.value = 'b'
  await expect.element(page.getByRole('textbox')).toHaveTextContent('Second')
  expect(editor.value?.hasPendingImages()).toBe(true)
  id.value = 'a'
  await expect.element(page.getByRole('textbox')).not.toHaveTextContent('Second')
  finish(markup)
  await expect.element(page.getByRole('img')).toBeVisible()
  expect(editor.value?.hasPendingImages()).toBe(false)
})

test('alt targets distinguish duplicate images, map preceding edits, preserve selection and undo once', async () => {
  const { texts, editor, imageTarget } = await harness(encodeClipboardImages, `${markup}\n\n${markup} tail`)
  await page.getByRole('button', { name: 'Edit alt text', exact: true }).nth(1).click()
  const target = imageTarget.value!
  editor.value!.selectRange(0, 0)
  await userEvent.keyboard('Prefix ')
  editor.value!.selectRange(texts.value.a!.length, texts.value.a!.length)
  expect(editor.value!.applyImageAlt(target, 'A [lake] \\ mountain')).toBe(true)
  expect(texts.value.a).toContain(`Prefix ${markup}\n\n![A \\[lake\\] \\\\ mountain]`)
  await userEvent.keyboard(' end')
  expect(texts.value.a?.endsWith(' tail end')).toBe(true)
  await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
  await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
  expect(texts.value.a).toBe(`Prefix ${markup}\n\n${markup} tail`)
})

test('deleted targets never update another image and document switches reject stale apply', async () => {
  const { texts, editor, id } = await harness(encodeClipboardImages, `${markup}\n\n${markup}`)
  const target = editor.value!.captureImage(0)!
  editor.value!.selectRange(0, markup.length)
  await userEvent.keyboard('{Backspace}')
  expect(editor.value!.applyImageAlt(target, 'Wrong')).toBe(false)
  const other = editor.value!.captureImage(2)!
  id.value = 'b'
  await expect.element(page.getByRole('textbox')).toHaveTextContent('Second')
  expect(editor.value!.applyImageAlt(other, 'Wrong')).toBe(false)
  expect(texts.value.a).toBe(`\n\n${markup}`)
})

test('image edit action captures its occurrence and decorative alt stays literally empty', async () => {
  const { editor } = await harness(encodeClipboardImages, markup)
  await expect.element(page.getByRole('button', { name: 'Edit alt text' })).toBeVisible()
  const target = editor.value!.captureImage(0)!
  expect(editor.value!.applyImageAlt(target, '')).toBe(true)
  expect(document.querySelector('.embedded-image')?.getAttribute('alt')).toBe('')
})

test('escaping an image invalidates its editable target even if its bytes stay intact', async () => {
  const { editor, texts } = await harness(encodeClipboardImages, markup)
  const target = editor.value!.captureImage(0)!
  editor.value!.selectRange(0, 0)
  await userEvent.keyboard('\\')
  expect(editor.value!.applyImageAlt(target, 'Wrong')).toBe(false)
  expect(texts.value.a).toBe(`\\${markup}`)
})
