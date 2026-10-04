import { expect, test } from 'vitest'
import { loadCaptionFiles } from '../src/features/assistance/adapters/captionFiles'
import { CAPTION_MODEL } from '../src/features/assistance/adapters/modelAssets'
function storage() {
  const responses = new Map<string, Response>()
  const cache: Pick<Cache, 'match' | 'put'> = {
    async match(request) { return responses.get(new Request(request).url)?.clone() },
    async put(request, response) { responses.set(new Request(request).url, response.clone()) },
  }
  return { cache, responses }
}
const configs: Record<string, unknown> = {
  'tokenizer.json': { model: { type: 'BPE', vocab: { a: 1 } } },
  'tokenizer_config.json': { tokenizer_class: 'GPT2Tokenizer' },
  'processor_config.json': { image_seq_len: 64 },
  'preprocessor_config.json': { image_processor_type: 'Idefics3ImageProcessor' },
}
test('caption files use exact pinned cache URLs and offline load never fetches', async () => {
  const { cache } = storage()
  const fetched: string[] = []
  const files = await loadCaptionFiles(false, { cache, fetchFile: async (url) => { fetched.push(url); return Response.json(configs[url.split('/').at(-1)!]) } })
  expect(fetched.every((url) => url.includes(`/resolve/${CAPTION_MODEL.revision}/`))).toBe(true)
  const offline = await loadCaptionFiles(true, { cache, fetchFile: async () => { throw new Error('Unexpected network') } })
  expect(offline).toEqual(files)
})
test('malformed downloads never poison cache, and explicit retry repairs malformed cached files', async () => {
  const { cache, responses } = storage()
  await expect(loadCaptionFiles(false, { cache, fetchFile: async () => Response.json({ wrong: true }) })).rejects.toThrow()
  expect(responses.size).toBe(0)
  const url = `https://huggingface.co/${CAPTION_MODEL.id}/resolve/${CAPTION_MODEL.revision}/tokenizer_config.json`
  responses.set(url, Response.json({ wrong: true }))
  await expect(loadCaptionFiles(true, { cache, fetchFile: async () => { throw new Error('Unexpected network') } })).rejects.toThrow('missing')
  await loadCaptionFiles(false, { cache, fetchFile: async (path) => Response.json(configs[path.split('/').at(-1)!]) })
  expect(await (await cache.match(url))!.json()).toEqual(configs['tokenizer_config.json'])
})
