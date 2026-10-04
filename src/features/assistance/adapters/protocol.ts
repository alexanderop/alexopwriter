import { z } from 'zod'

export { MODEL_INFO } from '../domain/modelInfo'
export type { WritingAction } from '../domain/assistant'
export const actionSchema = z.enum(['shorten', 'clarify', 'heading'])
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
