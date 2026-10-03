import { z } from 'zod'

export const MODEL_INFO = {
  id: 'onnx-community/Qwen2.5-0.5B-Instruct',
  revision: 'cc5cc01a65cc3ff17bdb73a7de33d879f62599b0',
  name: 'Qwen 2.5 · 0.5B',
  downloadLabel: 'About 525 MB',
  description:
    'Optional local writing help. Downloads from Hugging Face, then runs on your device. Suggestions can change meaning; review before accepting.',
} as const
export const actionSchema = z.enum(['shorten', 'clarify', 'heading'])
export type WritingAction = z.infer<typeof actionSchema>
export const requestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('enable'), id: z.string() }),
  z.object({
    type: z.literal('suggest'),
    id: z.string(),
    action: actionSchema,
    text: z.string().trim().min(1).max(2000),
  }),
])
export type WorkerRequest = z.infer<typeof requestSchema>
export const responseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('progress'),
    id: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string(),
  }),
  z.object({ type: z.literal('ready'), id: z.string() }),
  z.object({
    type: z.literal('result'),
    id: z.string(),
    text: z.string().trim().min(1).max(12000),
  }),
  z.object({ type: z.literal('error'), id: z.string(), message: z.string() }),
])
export type WorkerResponse = z.infer<typeof responseSchema>
