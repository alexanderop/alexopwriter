import { GPT2Tokenizer, Idefics3Processor, Idefics3ImageProcessor, Idefics3ForConditionalGeneration, RawImage, Tensor, env } from '@huggingface/transformers'
import runtimeModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import runtimeWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import { captionRequest, captionResponse, type CaptionResponse } from './captionProtocol'
import { CAPTION_MODEL } from './modelAssets'
import { loadCaptionFiles } from './captionFiles'
let loaded: Awaited<ReturnType<typeof load>> | null = null
let busy = false
const send = (response: CaptionResponse) => globalThis.postMessage(response)
async function load(localOnly: boolean, id: string) {
  env.allowLocalModels = localOnly
  env.allowRemoteModels = !localOnly
  const wasm = env.backends.onnx.wasm
  if (!wasm) throw new Error('This browser cannot run the image model.')
  wasm.numThreads = 1
  wasm.wasmPaths = { mjs: new URL(runtimeModuleUrl, import.meta.url).href, wasm: new URL(runtimeWasmUrl, import.meta.url).href }
  const options = {
    revision: CAPTION_MODEL.revision,
    local_files_only: localOnly,
    progress_callback: (progress: { status: string; file?: string }) => {
      if (progress.file) send({ type: 'progress', id, message: localOnly ? 'Loading image model…' : 'Downloading image model…' })
    },
  }
  const [files, model] = await Promise.all([
    loadCaptionFiles(localOnly),
    Idefics3ForConditionalGeneration.from_pretrained(CAPTION_MODEL.id, {
      ...options, device: 'wasm', dtype: { embed_tokens: 'q8', vision_encoder: 'q8', decoder_model_merged: 'q4' },
    }),
  ])
  const processor = new Idefics3Processor(files.processorConfig, {
    tokenizer: new GPT2Tokenizer(files.tokenizer, files.tokenizerConfig),
    image_processor: new Idefics3ImageProcessor(files.imageConfig),
  }, null)
  return { processor, model }
}
globalThis.addEventListener('message', (event: MessageEvent<unknown>) => {
  const parsed = captionRequest.safeParse(event.data)
  if (!parsed.success) return
  const request = parsed.data
  if (busy) { send({ type: 'error', id: request.id, message: 'Image model is busy.' }); return }
  busy = true
  void (async () => {
    try {
      loaded ??= await load(request.type !== 'download', request.id)
      if (request.type === 'download') { send({ type: 'ready', id: request.id }); return }
      const { processor, model } = loaded
      const image = await RawImage.read(request.source)
      const prompt = processor.apply_chat_template([{ role: 'user', content: [{ type: 'image' }, { type: 'text', text: 'Describe this image in one short sentence for alt text.' }] }], { add_generation_prompt: true })
      const inputs = await processor(prompt, image, { do_image_splitting: false })
      const output = await model.generate({ ...inputs, max_new_tokens: 60, do_sample: false })
      if (!(output instanceof Tensor)) throw new Error('The image model returned an unexpected result.')
      const text = processor.batch_decode(output.slice(null, [inputs.input_ids.dims[1], null]), { skip_special_tokens: true })[0]?.trim()
      send(captionResponse.parse({ type: 'result', id: request.id, text }))
    } catch (error) {
      send({ type: 'error', id: request.id, message: error instanceof Error ? error.message : 'Image description failed.' })
    } finally { busy = false }
  })()
})
