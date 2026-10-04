import { expect, test } from 'vitest'
import { createImageCaption, type CaptionWorker } from '../src/assistance/imageCaption'
import type { CaptionRequest } from '../src/assistance/captionProtocol'
import type { ModelFiles } from '../src/assistance/modelAssets'
const source = 'data:image/png;base64,YQ=='
function setup(files: ModelFiles = 'available') {
  const requests: CaptionRequest[] = []
  let starts = 0
  let removed = false
  let terminateCount = 0
  const worker: CaptionWorker = { onmessage: null, onerror: null, postMessage: (request) => requests.push(request), terminate: () => { terminateCount++ } }
  const caption = createImageCaption({ createWorker: () => { starts++; return worker }, inspect: async () => files, removeFiles: async () => { removed = true; files = 'absent' } })
  const reply = (data: unknown) => worker.onmessage?.(new MessageEvent('message', { data }))
  return { caption, requests, reply, worker, starts: () => starts, removed: () => removed, terminateCount: () => terminateCount, setFiles: (next: ModelFiles) => { files = next } }
}
test('opening inventory never downloads and describe rejects evicted or missing files', async () => {
  const state = setup('partial')
  await state.caption.refresh()
  expect(state.starts()).toBe(0)
  await expect(state.caption.describe(source)).rejects.toThrow('Download the image model')
  expect(state.starts()).toBe(0)
  expect(state.caption.snapshot().files).toBe('partial')
})
test('explicit download and matching description finish independently of stale responses', async () => {
  const state = setup()
  const download = state.caption.download()
  state.reply({ type: 'ready', id: state.requests[0]!.id })
  await download
  const result = state.caption.describe(source)
  await Promise.resolve()
  state.reply({ type: 'result', id: 'old', text: 'Wrong' })
  state.reply({ type: 'result', id: state.requests[1]!.id, text: 'A lake.' })
  await expect(result).resolves.toBe('A lake.')
  expect(state.caption.snapshot().phase).toBe('ready')
})
test('cancellation terminates worker and ignores its late callback', async () => {
  const state = setup()
  const result = state.caption.describe(source)
  const rejected = expect(result).rejects.toThrow('cancelled')
  await Promise.resolve()
  const stale = state.worker.onmessage
  state.caption.cancel()
  stale?.(new MessageEvent('message', { data: { type: 'result', id: '1', text: 'Late' } }))
  await rejected
  expect(state.caption.snapshot().phase).toBe('idle')
  expect(state.terminateCount()).toBe(1)
})
test('unexpected response kinds and invalid sources fail without leaving the controller busy', async () => {
  const state = setup()
  const result = state.caption.describe(source)
  const rejected = expect(result).rejects.toThrow('unexpected response')
  await Promise.resolve()
  state.reply({ type: 'ready', id: '1' })
  await rejected
  await expect(state.caption.describe('https://example.com/private.png')).rejects.toThrow()
  expect(state.caption.snapshot().phase).toBe('error')
  const retry = state.caption.download()
  state.reply({ type: 'ready', id: state.requests.at(-1)!.id })
  await retry
})
test('removal cancels inference and refreshes availability; disposal ignores callbacks', async () => {
  const state = setup()
  const result = state.caption.describe(source)
  const rejected = expect(result).rejects.toThrow('removed')
  await Promise.resolve()
  await state.caption.remove()
  await rejected
  expect(state.removed()).toBe(true)
  expect(state.caption.snapshot().files).toBe('absent')
  state.caption.dispose()
  await expect(state.caption.download()).rejects.toThrow('closed')
})

test('failed downloads refresh partial files rather than retaining absent inventory', async () => {
  const state = setup('absent')
  await state.caption.refresh()
  const downloading = state.caption.download()
  const rejected = expect(downloading).rejects.toThrow('Download interrupted')
  state.setFiles('partial')
  state.reply({ type: 'error', id: '1', message: 'Download interrupted' })
  await rejected
  expect(state.caption.snapshot().files).toBe('partial')
  expect(state.caption.snapshot().phase).toBe('error')
})

test('older inventory reads cannot restore downloaded status after removal', async () => {
  let finishRemoval: () => void = () => undefined
  const reads: ((files: ModelFiles) => void)[] = []
  const caption = createImageCaption({
    inspect: () => new Promise((resolve) => reads.push(resolve)),
    removeFiles: () => new Promise((resolve) => { finishRemoval = resolve }),
  })
  const removing = caption.remove()
  const older = caption.refresh()
  finishRemoval()
  await Promise.resolve()
  reads[1]!('absent')
  await removing
  reads[0]!('available')
  await older
  expect(caption.snapshot().files).toBe('absent')
})
