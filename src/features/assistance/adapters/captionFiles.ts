import { z } from 'zod'
import { CAPTION_MODEL } from './modelAssets'
const tokenizerSchema = z.object({ model: z.object({ type: z.string() }).loose() }).loose()
const tokenizerConfigSchema = z
  .object({ tokenizer_class: z.enum(['GPT2Tokenizer', 'GPT2TokenizerFast']) })
  .loose()
const processorSchema = z.object({ image_seq_len: z.number().int().positive() }).loose()
const imageConfigSchema = z
  .object({ image_processor_type: z.literal('Idefics3ImageProcessor') })
  .loose()
export async function loadCaptionFiles(
  localOnly: boolean,
  options?: { cache: Pick<Cache, 'match' | 'put'>; fetchFile: (url: string) => Promise<Response> },
) {
  const cache = options?.cache ?? (await caches.open('transformers-cache'))
  const fetchFile = options?.fetchFile ?? ((url: string) => fetch(url))
  async function json<T>(file: string, schema: z.ZodType<T>): Promise<T> {
    const url = `https://huggingface.co/${CAPTION_MODEL.id}/resolve/${CAPTION_MODEL.revision}/${file}`
    const cached = await cache.match(url)
    if (cached?.ok) {
      const parsed = schema.safeParse(await cached.json().catch(() => undefined))
      if (parsed.success) return parsed.data
    }
    if (localOnly)
      throw new Error('Image model files are missing. Download them again in Settings.')
    const response = await fetchFile(url)
    if (!response.ok)
      throw new Error(`Could not download image model configuration: HTTP ${response.status}`)
    const result = schema.parse(await response.clone().json())
    await cache.put(url, response)
    return result
  }
  // Transformers.js 4.3 AutoTokenizer drops revision/options during metadata
  // lookup. Construct from pinned files to keep cached inference network-free.
  const [tokenizer, tokenizerConfig, processorConfig, imageConfig] = await Promise.all([
    json('tokenizer.json', tokenizerSchema),
    json('tokenizer_config.json', tokenizerConfigSchema),
    json('processor_config.json', processorSchema),
    json('preprocessor_config.json', imageConfigSchema),
  ])
  return { tokenizer, tokenizerConfig, processorConfig, imageConfig }
}
