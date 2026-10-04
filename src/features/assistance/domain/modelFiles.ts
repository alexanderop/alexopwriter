import { MODEL_INFO } from './modelInfo'
export const CAPTION_MODEL = {
  id: 'HuggingFaceTB/SmolVLM-256M-Instruct',
  revision: '7e3e67edbbed1bf9888184d9df282b700a323964',
  name: 'SmolVLM · 256M',
  files: ['config.json', 'generation_config.json', 'preprocessor_config.json', 'processor_config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/embed_tokens_quantized.onnx', 'onnx/decoder_model_merged_q4.onnx', 'onnx/vision_encoder_quantized.onnx'],
} as const
const writingModel = { ...MODEL_INFO, files: ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'] } as const
export type ModelKind = 'caption' | 'writing'
export type ModelFiles = 'absent' | 'partial' | 'available' | 'unknown'
export function modelAssetUrls(kind: ModelKind): string[] {
  const model = kind === 'caption' ? CAPTION_MODEL : writingModel
  return model.files.map((file) => `https://huggingface.co/${model.id}/resolve/${model.revision}/${file}`)
}
