import type { AssistantState, LocalAssistant } from '../domain/assistant'
import {
  MODEL_INFO,
  requestSchema,
  responseSchema,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol.ts'

export type AssistantWorker = {
  postMessage(message: WorkerRequest): void
  terminate(): void
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}
export type LocalAssistantOptions = {
  createWorker: () => AssistantWorker
  removeCache: () => Promise<void>
}
export function isModelCacheRequest(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.origin === 'https://huggingface.co' &&
      decodeURIComponent(parsed.pathname).startsWith(`/${MODEL_INFO.id}/resolve/`)
    )
  } catch {
    return false
  }
}
export async function removeModelCache(): Promise<void> {
  if (!('caches' in globalThis)) return
  for (const name of await caches.keys()) {
    const cache = await caches.open(name)
    for (const request of await cache.keys()) {
      if (isModelCacheRequest(request.url)) await cache.delete(request)
    }
  }
}

export function createLocalAssistant(options: LocalAssistantOptions): LocalAssistant {
  let state: AssistantState = {
    phase: 'disabled',
    progress: 0,
    message: 'Local help is off.',
  }
  const listeners = new Set<(value: AssistantState) => void>()
  let worker: AssistantWorker | null = null
  let epoch = 0
  let sequence = 0
  let disposed = false
  let removing = false
  const isDisposed = () => disposed
  let pending: {
    id: string
    type: 'enable' | 'suggest'
    resolve: (text: string) => void
    reject: (error: Error) => void
  } | null = null
  const publish = (next: AssistantState) => {
    state = next
    for (const listener of listeners) listener(state)
  }
  const stop = (reason: Error) => {
    epoch += 1
    worker?.terminate()
    worker = null
    const previous = pending
    pending = null
    previous?.reject(reason)
  }
  const fail = (message: string) => {
    stop(new Error(message))
    publish({ phase: 'error', progress: 0, message })
  }
  const receive = (message: WorkerResponse) => {
    if (pending === null || pending.id !== message.id) return
    if (message.type === 'progress') {
      if (pending.type === 'enable')
        publish({
          phase: 'loading',
          progress: message.progress,
          message: message.message,
        })
      return
    }
    if (message.type === 'error') {
      fail(message.message)
      return
    }
    const expected = pending.type === 'enable' ? 'ready' : 'result'
    if (message.type !== expected) {
      fail('The local model returned an unexpected response.')
      return
    }
    const completion = pending
    pending = null
    publish({
      phase: 'ready',
      progress: 100,
      message: 'Local help is ready. Text stays on your device.',
    })
    completion.resolve(message.type === 'result' ? message.text : '')
  }
  const connect = () => {
    if (worker !== null) return worker
    const generation = ++epoch
    const created = options.createWorker()
    created.onmessage = (event) => {
      if (generation !== epoch || disposed) return
      const result = responseSchema.safeParse(event.data)
      if (!result.success) {
        fail('The local model returned an invalid response.')
        return
      }
      receive(result.data)
    }
    created.onerror = (event) => {
      if (generation === epoch && !disposed)
        fail(event.message || 'The local model worker stopped.')
    }
    worker = created
    return created
  }
  const send = (request: WorkerRequest): Promise<string> =>
    new Promise((resolve, reject) => {
      pending = { id: request.id, type: request.type, resolve, reject }
      try {
        connect().postMessage(request)
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Could not start local help.')
      }
    })
  const available = () => {
    if (disposed) throw new Error('Local help has been disposed.')
    if (removing) throw new Error('Wait for model removal to finish.')
    if (pending !== null) throw new Error('Local help is busy. Cancel the current operation first.')
  }
  return {
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => {
        listeners.delete(listener)
      }
    },
    async enable() {
      available()
      if (state.phase === 'ready') return
      publish({
        phase: 'loading',
        progress: 0,
        message: 'Downloading local model…',
      })
      await send({ type: 'enable', id: String(++sequence) })
    },
    async suggest(action, text) {
      available()
      if (state.phase !== 'ready') throw new Error('Download and enable local help first.')
      const parsed = requestSchema.safeParse({
        type: 'suggest',
        id: String(++sequence),
        action,
        text,
      })
      if (!parsed.success) throw new Error('Select between 1 and 2,000 characters for local help.')
      publish({
        phase: 'running',
        progress: 100,
        message: 'Writing a suggestion on your device…',
      })
      return await send(parsed.data)
    },
    cancel() {
      stop(new Error('Local help cancelled.'))
      if (!isDisposed())
        publish({
          phase: 'disabled',
          progress: 0,
          message: 'Cancelled. Enable again to reload cached model files.',
        })
    },
    async remove() {
      if (disposed || removing) return
      removing = true
      stop(new Error('Local model removed.'))
      publish({
        phase: 'disabled',
        progress: 0,
        message: 'Removing downloaded model files…',
      })
      try {
        await options.removeCache()
        if (!isDisposed())
          publish({
            phase: 'disabled',
            progress: 0,
            message: 'Downloaded model files removed.',
          })
      } catch (error) {
        if (!isDisposed())
          publish({
            phase: 'error',
            progress: 0,
            message: error instanceof Error ? error.message : 'Could not remove model files.',
          })
        throw error
      } finally {
        removing = false
      }
    },
    dispose() {
      disposed = true
      stop(new Error('Local help disposed.'))
      listeners.clear()
    },
  }
}
