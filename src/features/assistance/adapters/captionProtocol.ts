import { z } from 'zod'
export const captionRequest = z.discriminatedUnion('type', [
  z.object({ type: z.literal('download'), id: z.string() }),
  z.object({
    type: z.literal('describe'),
    id: z.string(),
    source: z.string().regex(/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/u),
  }),
])
export const captionResponse = z.discriminatedUnion('type', [
  z.object({ type: z.literal('progress'), id: z.string(), message: z.string() }),
  z.object({ type: z.literal('ready'), id: z.string() }),
  z.object({ type: z.literal('result'), id: z.string(), text: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal('error'), id: z.string(), message: z.string() }),
])
export type CaptionRequest = z.infer<typeof captionRequest>
export type CaptionResponse = z.infer<typeof captionResponse>
