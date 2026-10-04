import type {
  ProgressCallback,
  TextGenerationPipeline,
} from '@huggingface/transformers'
import runtimeModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import runtimeWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import { MODEL_INFO } from './protocol.ts'
import { loadPinnedTokenizerFiles } from './tokenizerFiles.ts'

export async function loadLocalModel(
  progress: ProgressCallback,
): Promise<TextGenerationPipeline> {
  const { Qwen2Tokenizer, AutoModelForCausalLM, TextGenerationPipeline, env } =
    await import('@huggingface/transformers')
  env.allowLocalModels = false
  const wasm = env.backends.onnx.wasm
  if (!wasm)
    throw new Error('This browser does not support the local model runtime.')
  wasm.wasmPaths = {
    mjs: new URL(runtimeModuleUrl, import.meta.url).href,
    wasm: new URL(runtimeWasmUrl, import.meta.url).href,
  }
  const options = { revision: MODEL_INFO.revision, progress_callback: progress }
  const [files, model] = await Promise.all([
    loadPinnedTokenizerFiles(),
    AutoModelForCausalLM.from_pretrained(MODEL_INFO.id, {
      ...options,
      dtype: 'q8',
      device: 'wasm',
    }),
  ])
  const tokenizer = new Qwen2Tokenizer(files.tokenizer, files.config)
  return new TextGenerationPipeline({
    task: 'text-generation',
    tokenizer,
    model,
  })
}
