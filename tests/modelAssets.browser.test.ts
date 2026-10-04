import { expect, test } from 'vitest'
import { inspectModelFiles, modelAssetUrls, removeModelFiles } from '../src/assistance/modelAssets'
test('actual browser cache inventory requires every pinned asset and removal preserves other models', async () => {
  const cacheName = `model-test-${crypto.randomUUID()}`
  const cache = await caches.open(cacheName)
  const captionUrls = modelAssetUrls('caption')
  const writingUrl = modelAssetUrls('writing')[0]!
  try {
    expect(await inspectModelFiles('caption')).toBe('absent')
    await cache.put(captionUrls[0]!, new Response('config'))
    expect(await inspectModelFiles('caption')).toBe('partial')
    for (const url of captionUrls) await cache.put(url, new Response('fixture'))
    await cache.put(writingUrl, new Response('writing'))
    await cache.put('https://example.com/runtime.wasm', new Response('runtime'))
    expect(await inspectModelFiles('caption')).toBe('available')
    await cache.delete(captionUrls[1]!)
    expect(await inspectModelFiles('caption')).toBe('partial')
    await removeModelFiles('caption')
    expect(await inspectModelFiles('caption')).toBe('absent')
    expect(await cache.match(writingUrl)).toBeDefined()
    expect(await cache.match('https://example.com/runtime.wasm')).toBeDefined()
  } finally { await caches.delete(cacheName) }
})
