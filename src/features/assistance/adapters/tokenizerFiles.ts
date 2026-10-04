import { z } from 'zod'
import { MODEL_INFO } from './protocol.ts'

const tokenizerSchema = z.object({ model: z.object({ type: z.string() }).loose() }).loose()
const configSchema = z
  .object({ tokenizer_class: z.enum(['Qwen2Tokenizer', 'Qwen2TokenizerFast']) })
  .loose()
export type TokenizerFileOptions = {
  fetchFile: (url: string) => Promise<Response>
  cache: Pick<Cache, 'match' | 'put'> | undefined
}

async function loadPinnedJson(file: string, options: TokenizerFileOptions) {
  const url = `https://huggingface.co/${MODEL_INFO.id}/resolve/${MODEL_INFO.revision}/${file}`
  const cached = await options.cache?.match(url)
  if (cached) return await cached.json()
  const response = await options.fetchFile(url)
  if (!response.ok) throw new Error(`Could not download ${file}: HTTP ${response.status}`)
  const data: unknown = await response.clone().json()
  if (file === 'tokenizer.json') tokenizerSchema.parse(data)
  else configSchema.parse(data)
  await options.cache?.put(url, response)
  return data
}

export async function loadPinnedTokenizerFiles(options?: TokenizerFileOptions) {
  const dependencies = options ?? {
    fetchFile: (url: string) => fetch(url),
    cache: 'caches' in globalThis ? await caches.open('alexopwriter-model-tokenizer') : undefined,
  }
  const [tokenizer, config] = await Promise.all([
    loadPinnedJson('tokenizer.json', dependencies),
    loadPinnedJson('tokenizer_config.json', dependencies),
  ])
  return {
    tokenizer: tokenizerSchema.parse(tokenizer),
    config: configSchema.parse(config),
  }
}
