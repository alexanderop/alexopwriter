import type { AssistantState, LocalAssistant } from '../../src/features/assistance'
export function controlledAssistant() {
  let state: AssistantState = { phase: 'ready', progress: 100, message: 'Ready' }
  const listeners = new Set<(state: AssistantState) => void>()
  const requests: { text: string; resolve: (text: string) => void; reject: (error: Error) => void }[] = []
  let cancellations = 0
  function publish(phase: AssistantState['phase']) {
    state = { ...state, phase }
    listeners.forEach(listener => listener(state))
  }
  const assistant: LocalAssistant = {
    snapshot: () => state,
    subscribe(listener) { listeners.add(listener); listener(state); return () => { listeners.delete(listener) } },
    async enable() { publish('ready') },
    suggest(_action, text) {
      publish('running')
      return new Promise((resolve, reject) => { requests.push({ text, resolve: value => { publish('ready'); resolve(value) }, reject }) })
    },
    cancel() { cancellations += 1; publish('disabled') },
    async remove() { publish('disabled') },
    dispose() { listeners.clear() },
  }
  return { assistant, requests, cancellations: () => cancellations }
}
