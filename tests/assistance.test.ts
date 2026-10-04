import { MODEL_INFO } from '../src/features/assistance'
import { describe, expect, it } from 'vitest'
import {
  createLocalAssistant,
  isModelCacheRequest,
  type AssistantWorker,
} from '../src/features/assistance/adapters/localAssistant.ts'
import type { WorkerRequest } from '../src/features/assistance/adapters/protocol.ts'

function controlledWorker() {
  const requests: WorkerRequest[] = []
  let terminated = false
  const worker: AssistantWorker = {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      requests.push(message)
    },
    terminate() {
      terminated = true
    },
  }
  return {
    worker,
    requests,
    terminated: () => terminated,
    reply(data: Record<string, string | number | undefined>) {
      worker.onmessage?.(new MessageEvent('message', { data }))
    },
  }
}

async function readyAssistant() {
  const channel = controlledWorker()
  const assistant = createLocalAssistant({
    removeCache: async () => {},
    createWorker: () => channel.worker,
  })
  const loading = assistant.enable()
  channel.reply({ type: 'ready', id: channel.requests[0]?.id })
  await loading
  return { channel, assistant }
}

describe('optional local assistance', () => {
  it('starts a worker only after explicit enable and reports progress', async () => {
    const channel = controlledWorker()
    let starts = 0
    const assistant = createLocalAssistant({
      removeCache: async () => {},
      createWorker: () => {
        starts += 1
        return channel.worker
      },
    })
    expect(starts).toBe(0)
    const loading = assistant.enable()
    expect(starts).toBe(1)
    channel.reply({
      type: 'progress',
      id: '1',
      progress: 42,
      message: 'Downloading weights',
    })
    expect(assistant.snapshot()).toEqual({
      phase: 'loading',
      progress: 42,
      message: 'Downloading weights',
    })
    channel.reply({ type: 'ready', id: '1' })
    await loading
    expect(assistant.snapshot().phase).toBe('ready')
    assistant.dispose()
  })

  it('ignores stale requests and returns only the matching generated passage', async () => {
    const { assistant, channel } = await readyAssistant()
    const result = assistant.suggest('shorten', 'The original passage.')
    channel.reply({ type: 'result', id: 'old-request', text: 'Wrong passage' })
    expect(assistant.snapshot().phase).toBe('running')
    channel.reply({
      type: 'result',
      id: channel.requests[1]?.id,
      text: 'Short passage.',
    })
    await expect(result).resolves.toBe('Short passage.')
    assistant.dispose()
  })

  it('cancels active computation and rejects late output while observers remain subscribed', async () => {
    const { assistant, channel } = await readyAssistant()
    const observed: string[] = []
    const unsubscribe = assistant.subscribe((state) => {
      observed.push(state.phase)
    })
    const result = assistant.suggest('clarify', 'A passage.')
    assistant.cancel()
    channel.reply({
      type: 'result',
      id: channel.requests[1]?.id,
      text: 'Late text.',
    })
    await expect(result).rejects.toThrow('cancelled')
    expect(channel.terminated()).toBe(true)
    expect(observed).toEqual(['ready', 'running', 'disabled'])
    unsubscribe()
    assistant.dispose()
  })

  it('reports download failure and permits retry through a fresh worker', async () => {
    const channels = [controlledWorker(), controlledWorker()]
    let created = 0
    const assistant = createLocalAssistant({
      removeCache: async () => {},
      createWorker: () => {
        const channel = channels[created++]
        if (!channel) throw new Error('Unexpected worker')
        return channel.worker
      },
    })
    const first = assistant.enable()
    channels[0]?.reply({
      type: 'error',
      id: '1',
      message: 'Network unavailable',
    })
    await expect(first).rejects.toThrow('Network unavailable')
    expect(assistant.snapshot().phase).toBe('error')
    const retry = assistant.enable()
    channels[0]?.reply({ type: 'ready', id: '1' })
    expect(assistant.snapshot().phase).toBe('loading')
    channels[1]?.reply({ type: 'ready', id: '2' })
    await retry
    expect(assistant.snapshot().phase).toBe('ready')
    assistant.dispose()
  })

  it('validates malformed worker responses and bounds selection size before inference', async () => {
    const { assistant, channel } = await readyAssistant()
    await expect(assistant.suggest('shorten', 'x'.repeat(2001))).rejects.toThrow('2,000')
    expect(channel.requests).toHaveLength(1)
    const result = assistant.suggest('heading', 'A passage.')
    channel.reply({ type: 'result', id: channel.requests[1]?.id, text: 42 })
    await expect(result).rejects.toThrow('invalid response')
    expect(assistant.snapshot().phase).toBe('error')
    assistant.dispose()
  })

  it('settles a pending request on disposal and cannot restart', async () => {
    const { assistant } = await readyAssistant()
    const result = assistant.suggest('shorten', 'A passage.')
    assistant.dispose()
    await expect(result).rejects.toThrow('disposed')
    await expect(assistant.enable()).rejects.toThrow('disposed')
  })

  it('removes the model through the cache boundary and disables inference', async () => {
    let removed = false
    const channel = controlledWorker()
    const assistant = createLocalAssistant({
      createWorker: () => channel.worker,
      removeCache: async () => {
        removed = true
      },
    })
    const enabled = assistant.enable()
    channel.reply({ type: 'ready', id: '1' })
    await enabled
    await assistant.remove()
    expect(removed).toBe(true)
    expect(channel.terminated()).toBe(true)
    expect(assistant.snapshot().phase).toBe('disabled')
    await expect(assistant.suggest('clarify', 'Text')).rejects.toThrow('enable')
    assistant.dispose()
  })

  it('only selects cache entries belonging to the chosen model', () => {
    expect(
      isModelCacheRequest(
        `https://huggingface.co/${MODEL_INFO.id}/resolve/${MODEL_INFO.revision}/onnx/model_quantized.onnx`,
      ),
    ).toBe(true)
    expect(
      isModelCacheRequest(`https://huggingface.co/${MODEL_INFO.id}-other/resolve/main/model.onnx`),
    ).toBe(false)
    expect(
      isModelCacheRequest(`https://example.com/${MODEL_INFO.id}/resolve/main/model.onnx`),
    ).toBe(false)
    expect(isModelCacheRequest('https://writer.example/assets/app.js')).toBe(false)
    expect(isModelCacheRequest('not-a-url')).toBe(false)
  })
})
