import type { CaptionState, ImageCaption } from '../domain/imageCaption'
export type { CaptionState, ImageCaption } from '../domain/imageCaption'
import { captionRequest, captionResponse, type CaptionRequest } from './captionProtocol'
import { inspectModelFiles, removeModelFiles, type ModelFiles } from './modelAssets'
export type CaptionWorker = {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(request: CaptionRequest): void
  terminate(): void
}
export function createImageCaption(
  options: {
    createWorker?: () => CaptionWorker
    inspect?: () => Promise<ModelFiles>
    removeFiles?: () => Promise<void>
  } = {},
): ImageCaption {
  const inspect = options.inspect ?? (() => inspectModelFiles('caption'))
  let state: CaptionState = {
    phase: 'idle',
    files: 'unknown',
    message: 'Local image descriptions are off.',
  }
  const listeners = new Set<(state: CaptionState) => void>()
  let worker: CaptionWorker | null = null
  let epoch = 0
  let sequence = 0
  let inventorySequence = 0
  let disposed = false
  let operation = false
  let pending: {
    id: string
    type: 'download' | 'describe'
    resolve: (text: string) => void
    reject: (error: Error) => void
  } | null = null
  const publish = (next: Partial<CaptionState>) => {
    if (disposed) return
    state = { ...state, ...next }
    listeners.forEach((listener) => listener(state))
  }
  function stop(message: string) {
    epoch++
    worker?.terminate()
    worker = null
    const old = pending
    pending = null
    operation = false
    old?.reject(new Error(message))
  }
  async function refresh() {
    const before = epoch
    const inventory = ++inventorySequence
    const files = await inspect()
    if (before === epoch && inventory === inventorySequence) publish({ files })
  }
  function request(type: 'download' | 'describe', source = ''): Promise<string> {
    if (!worker) {
      worker =
        options.createWorker?.() ??
        new Worker(new URL('./caption.worker.ts', import.meta.url), { type: 'module' })
      const current = worker
      current.onmessage = (event) => {
        if (disposed || worker !== current || !pending) return
        const parsed = captionResponse.safeParse(event.data)
        if (!parsed.success) {
          stop('The image model returned an invalid response.')
          publish({ phase: 'error', message: 'The image model returned an invalid response.' })
          void refresh()
          return
        }
        const response = parsed.data
        if (response.id !== pending.id) return
        if (response.type === 'progress') {
          publish({ message: response.message })
          return
        }
        if (
          (response.type === 'ready' && pending.type !== 'download') ||
          (response.type === 'result' && pending.type !== 'describe')
        ) {
          stop('The image model returned an unexpected response.')
          publish({ phase: 'error', message: 'The image model returned an unexpected response.' })
          void refresh()
          return
        }
        const finish = pending
        pending = null
        if (response.type === 'error') {
          stop(response.message)
          publish({ phase: 'error', message: response.message })
          void refresh()
          finish.reject(new Error(response.message))
        } else {
          finish.resolve(response.type === 'result' ? response.text : '')
        }
      }
      current.onerror = (event) => {
        if (worker !== current) return
        stop(event.message || 'The image model stopped.')
        publish({ phase: 'error', message: event.message || 'The image model stopped.' })
        void refresh()
      }
    }
    const id = String(++sequence)
    return new Promise((resolve, reject) => {
      pending = { id, type, resolve, reject }
      worker?.postMessage(
        captionRequest.parse(type === 'download' ? { type, id } : { type, id, source }),
      )
    })
  }
  async function run(type: 'download' | 'describe', source = '') {
    if (disposed) throw new Error('Image descriptions are closed.')
    if (operation) throw new Error('The image model is busy.')
    if (type === 'download') {
      worker?.terminate()
      worker = null
    }
    operation = true
    const before = epoch
    try {
      publish({
        phase: type === 'download' ? 'loading' : 'generating',
        message: type === 'download' ? 'Downloading image model…' : 'Preparing image description…',
      })
      if (type === 'describe') {
        if (!captionRequest.safeParse({ type, id: '', source }).success)
          throw new Error('Select an embedded PNG, JPEG, GIF or WebP image.')
        const inventory = ++inventorySequence
        const files = await inspect()
        if (before !== epoch) throw new Error('Image description cancelled.')
        if (inventory === inventorySequence) publish({ files })
        if (files !== 'available')
          throw new Error(
            'Download the image model in Settings first. Its files are missing or incomplete.',
          )
      }
      const text = await request(type, source)
      if (before !== epoch) throw new Error('Image description cancelled.')
      await refresh()
      if (before !== epoch) throw new Error('Image description cancelled.')
      publish({ phase: 'ready', message: 'Ready in this session.' })
      return text
    } catch (error) {
      if (before === epoch) {
        stop('Image description failed.')
        publish({
          phase: 'error',
          message: error instanceof Error ? error.message : 'Image description failed.',
        })
        void refresh()
      }
      throw error
    } finally {
      if (before === epoch) operation = false
    }
  }
  return {
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    refresh,
    download: async () => {
      await run('download')
    },
    describe: (source) => run('describe', source),
    cancel() {
      stop('Image description cancelled.')
      publish({ phase: 'idle', message: 'Stopped. Cached files are kept.' })
      void refresh()
    },
    async remove() {
      if (disposed || state.phase === 'removing') return
      stop('Image model removed.')
      operation = true
      const before = epoch
      publish({ phase: 'removing', message: 'Removing image model files…' })
      try {
        await (options.removeFiles ?? (() => removeModelFiles('caption')))()
        if (before !== epoch) return
        await refresh()
        publish({ phase: 'idle', message: 'Image model files removed.' })
      } catch (error) {
        if (before === epoch) {
          publish({
            phase: 'error',
            message: error instanceof Error ? error.message : 'Could not remove image model.',
          })
          void refresh()
        }
        throw error
      } finally {
        if (before === epoch) operation = false
      }
    },
    dispose() {
      disposed = true
      stop('Image descriptions closed.')
      listeners.clear()
    },
  }
}
