export type WritingAction = 'shorten' | 'clarify' | 'heading'
export type AssistantState = Readonly<{
  phase: 'disabled' | 'loading' | 'ready' | 'running' | 'error'
  progress: number
  message: string
}>
export type LocalAssistant = {
  snapshot(): AssistantState
  subscribe(listener: (state: AssistantState) => void): () => void
  enable(): Promise<void>
  suggest(action: WritingAction, text: string): Promise<string>
  cancel(): void
  remove(): Promise<void>
  dispose(): void
}

