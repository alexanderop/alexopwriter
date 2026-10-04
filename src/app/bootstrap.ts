import type { Workspace } from '../documents'
import type { LocalAssistant } from '../assistance'
import { createLocalAssistant, removeModelCache } from '../assistance/adapters/localAssistant'
import { createWorkspace } from '../documents'
import { browserFiles } from '../documents/adapters/browserFiles'
import { indexedDbRecovery } from '../documents/adapters/indexedDbRecovery'
export function createBrowserWorkspace() {
  return createWorkspace({
    recovery: indexedDbRecovery(),
    files: browserFiles(),
    actor: crypto.randomUUID(),
    id: () => crypto.randomUUID(),
    now: Date.now,
    scheduler: {
      schedule(delay, task) {
        const timer = setTimeout(task, delay)
        return () => clearTimeout(timer)
      },
    },
  })
}

export type WriterServices = {
  readonly workspace: Workspace
  readonly assistant: LocalAssistant
}
export function createBrowserServices(): WriterServices {
  return {
    workspace: createBrowserWorkspace(),
    assistant: createLocalAssistant({
      createWorker: () => new Worker(new URL('../assistance/adapters/model.worker.ts', import.meta.url), { type: 'module' }),
      removeCache: removeModelCache,
    }),
  }
}
