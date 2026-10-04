import type { LocalAssistant, WritingAction } from '../../features/assistance'
import type { EditorPort, SelectionTarget } from '../../features/editor'
import type { Workspace } from '../../features/documents'

export type SuggestionNotice =
  | { readonly kind: 'none' | 'select' | 'images' | 'changed' | 'applied' | 'stale' }
  | { readonly kind: 'error'; readonly message: string }
export type SuggestionSnapshot = {
  readonly proposal: { readonly target: SelectionTarget; readonly text: string } | null
  readonly notice: SuggestionNotice
}
export function createSuggestionSession(dependencies: {
  readonly workspace: Pick<Workspace, 'snapshot' | 'subscribe'>
  readonly assistant: LocalAssistant
  readonly editor: EditorPort
  readonly canSuggest: (text: string) => boolean
}) {
  const { workspace, assistant, editor } = dependencies
  let state: SuggestionSnapshot = { proposal: null, notice: { kind: 'none' } }
  let epoch = 0
  let disposed = false
  let activeId = workspace.snapshot().activeId
  const listeners = new Set<(snapshot: SuggestionSnapshot) => void>()
  function publish(next: SuggestionSnapshot) {
    if (disposed) return
    state = next
    for (const listener of listeners) listener(state)
  }
  function clear() {
    epoch += 1
    publish({ proposal: null, notice: { kind: 'none' } })
  }
  const unsubscribe = workspace.subscribe(snapshot => {
    if (snapshot.activeId === activeId) return
    activeId = snapshot.activeId
    clear()
    if (assistant.snapshot().phase === 'running') assistant.cancel()
  })
  return {
    snapshot: () => state,
    subscribe(listener: (snapshot: SuggestionSnapshot) => void) {
      listeners.add(listener)
      listener(state)
      return () => { listeners.delete(listener) }
    },
    async suggest(action: WritingAction) {
      if (disposed) return
      clear()
      const request = epoch
      const target = editor.captureSelection()
      if (!target) {
        publish({ proposal: null, notice: { kind: 'select' } })
        return
      }
      if (!dependencies.canSuggest(target.text)) {
        publish({ proposal: null, notice: { kind: 'images' } })
        return
      }
      try {
        const text = await assistant.suggest(action, target.text)
        if (disposed || request !== epoch) return
        const snapshot = workspace.snapshot()
        if (snapshot.activeId !== target.documentId) return
        const document = snapshot.documents.find(item => item.id === target.documentId)
        if (document?.revision !== target.revision) {
          publish({ proposal: null, notice: { kind: 'changed' } })
          return
        }
        publish({ proposal: { target, text }, notice: { kind: 'none' } })
      } catch (error) {
        if (!disposed && request === epoch) publish({ proposal: null, notice: {
          kind: 'error', message: error instanceof Error ? error.message : 'The suggestion could not be completed.',
        } })
      }
    },
    accept() {
      if (disposed || !state.proposal) return
      const { target, text } = state.proposal
      const snapshot = workspace.snapshot()
      const document = snapshot.documents.find(item => item.id === snapshot.activeId)
      const applied = document?.id === target.documentId && document.revision === target.revision &&
        editor.applyReplacement(target, text)
      clear()
      publish({ proposal: null, notice: { kind: applied ? 'applied' : 'stale' } })
    },
    discard: clear,
    dismissNotice() { publish({ ...state, notice: { kind: 'none' } }) },
    cancel() {
      if (disposed) return
      clear()
      assistant.cancel()
    },
    dispose() {
      if (disposed) return
      epoch += 1
      disposed = true
      unsubscribe()
      listeners.clear()
    },
  }
}
