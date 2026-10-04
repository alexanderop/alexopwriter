import type { DiskBinding, OpenedFile, FileAccess } from '../application/ports'
export type NativeFileHandle = {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{
    write(text: string): Promise<void>
    close(): Promise<void>
    abort(): Promise<void>
  }>
}
function isHandle(value: unknown): value is NativeFileHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'getFile' in value &&
    typeof value.getFile === 'function' &&
    'createWritable' in value &&
    typeof value.createWritable === 'function'
  )
}
function binding(handle: NativeFileHandle): DiskBinding {
  return {
    async read() {
      return (await handle.getFile()).text()
    },
    async write(text) {
      const writable = await handle.createWritable()
      try {
        await writable.write(text)
        await writable.close()
      } catch (error) {
        await writable.abort().catch(() => undefined)
        throw error
      }
    },
  }
}
function cancelled(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === 'AbortError'
}
async function inputFile(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.txt,.text,.mdx,text/plain,text/markdown'
    input.hidden = true
    const finish = (result: OpenedFile | null) => {
      input.remove()
      resolve(result)
    }
    input.addEventListener('cancel', () => finish(null), { once: true })
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.item(0)
        if (!file) {
          finish(null)
          return
        }
        void file.text().then(
          (text) => finish({ name: file.name, text, binding: null }),
          () => finish(null),
        )
      },
      { once: true },
    )
    document.body.append(input)
    input.click()
  })
}
function hasOpenPicker(value: Window): value is Window & {
  showOpenFilePicker(options: { multiple: boolean }): Promise<NativeFileHandle[]>
} {
  return 'showOpenFilePicker' in value && typeof value.showOpenFilePicker === 'function'
}
function hasSavePicker(value: Window): value is Window & {
  showSaveFilePicker(options: { suggestedName: string }): Promise<NativeFileHandle>
} {
  return 'showSaveFilePicker' in value && typeof value.showSaveFilePicker === 'function'
}
export type BrowserFilePickers = {
  open(): Promise<readonly NativeFileHandle[] | null>
  save(name: string): Promise<NativeFileHandle | null>
}
const nativePickers: BrowserFilePickers = {
  async open() {
    return hasOpenPicker(window) ? window.showOpenFilePicker({ multiple: false }) : null
  },
  async save(name) {
    return hasSavePicker(window) ? window.showSaveFilePicker({ suggestedName: name }) : null
  },
}
export function browserFiles(pickers: BrowserFilePickers = nativePickers): FileAccess {
  return {
    async open() {
      try {
        const result: unknown = await pickers.open()
        if (result === null) return inputFile()
        if (!Array.isArray(result))
          throw new Error('The browser returned an invalid file selection.')
        const handle: unknown = result[0]
        if (!isHandle(handle)) throw new Error('The selected file cannot be edited.')
        return {
          name: handle.name,
          text: await (await handle.getFile()).text(),
          binding: binding(handle),
        }
      } catch (error) {
        if (cancelled(error)) return null
        throw error
      }
    },
    async saveAs(name) {
      try {
        const handle: unknown = await pickers.save(name)
        if (handle === null) return null
        if (!isHandle(handle)) throw new Error('The browser returned an invalid file destination.')
        return binding(handle)
      } catch (error) {
        if (cancelled(error)) return null
        throw error
      }
    },
    download(name, text) {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  }
}
