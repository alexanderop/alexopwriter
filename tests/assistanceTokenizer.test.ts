import { describe, expect, it } from 'vitest'
import {
  loadPinnedTokenizerFiles,
  type TokenizerFileOptions,
} from '../src/features/assistance/adapters/tokenizerFiles.ts'
import { MODEL_INFO } from '../src/features/assistance/adapters/protocol.ts'

function tokenizerCache() {
  const responses = new Map<string, Response>()
  const cache: NonNullable<TokenizerFileOptions['cache']> = {
    async match(request) {
      return responses.get(new Request(request).url)?.clone()
    },
    async put(request, response) {
      responses.set(new Request(request).url, response.clone())
    },
  }
  return { cache, responses }
}

describe('pinned tokenizer files', () => {
  it('loads exact pinned URLs and then restores from cache with networking unavailable', async () => {
    const { cache } = tokenizerCache()
    const requests: string[] = []
    const online = await loadPinnedTokenizerFiles({
      cache,
      fetchFile: async (url) => {
        requests.push(url)
        return Response.json(
          url.endsWith('tokenizer_config.json')
            ? { tokenizer_class: 'Qwen2Tokenizer', chat_template: 'template' }
            : { model: { type: 'BPE', vocab: { a: 1 } } },
        )
      },
    })
    expect(requests).toEqual([
      `https://huggingface.co/${MODEL_INFO.id}/resolve/${MODEL_INFO.revision}/tokenizer.json`,
      `https://huggingface.co/${MODEL_INFO.id}/resolve/${MODEL_INFO.revision}/tokenizer_config.json`,
    ])
    const offline = await loadPinnedTokenizerFiles({
      cache,
      fetchFile: async () => {
        throw new Error('Network unavailable')
      },
    })
    expect(offline).toEqual(online)
    expect(offline.config.tokenizer_class).toBe('Qwen2Tokenizer')
  })

  it('rejects malformed downloaded files before inserting them into the cache', async () => {
    const { cache, responses } = tokenizerCache()
    await expect(
      loadPinnedTokenizerFiles({
        cache,
        fetchFile: async () => Response.json({ unexpected: true }),
      }),
    ).rejects.toThrow('Invalid')
    expect(responses.size).toBe(0)
  })

  it('rejects a failed download without caching its error response', async () => {
    const { cache, responses } = tokenizerCache()
    await expect(
      loadPinnedTokenizerFiles({
        cache,
        fetchFile: async () => new Response('Unavailable', { status: 503 }),
      }),
    ).rejects.toThrow('HTTP 503')
    expect(responses.size).toBe(0)
  })

  it('revalidates cached data instead of passing corrupt files to the tokenizer', async () => {
    const { cache, responses } = tokenizerCache()
    for (const file of ['tokenizer.json', 'tokenizer_config.json']) {
      responses.set(
        `https://huggingface.co/${MODEL_INFO.id}/resolve/${MODEL_INFO.revision}/${file}`,
        Response.json({ wrong: true }),
      )
    }
    await expect(
      loadPinnedTokenizerFiles({
        cache,
        fetchFile: async () => {
          throw new Error('Unexpected network')
        },
      }),
    ).rejects.toThrow('Invalid')
  })
})
