import type { ModelFiles } from './modelFiles'
export type CaptionState = Readonly<{
  phase: 'idle' | 'loading' | 'ready' | 'generating' | 'removing' | 'error'
  files: ModelFiles
  message: string
}>
export type ImageCaption = {
  snapshot(): CaptionState
  subscribe(listener: (state: CaptionState) => void): () => void
  refresh(): Promise<void>
  download(): Promise<void>
  describe(source: string): Promise<string>
  cancel(): void
  remove(): Promise<void>
  dispose(): void
}
