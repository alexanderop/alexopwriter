import type { ImageCaption, ModelFiles } from '../features/assistance'
import { createImageCaption } from '../features/assistance/adapters/imageCaption'
import { inspectModelFiles } from '../features/assistance/adapters/modelAssets'
import type { Workspace } from '../features/documents'
import type { LocalAssistant } from '../features/assistance'
import {
  createLocalAssistant,
  removeModelCache,
} from '../features/assistance/adapters/localAssistant'
import { createWorkspace } from '../features/documents'
import { browserFiles } from '../features/documents/adapters/browserFiles'
import { indexedDbRecovery } from '../features/documents/adapters/indexedDbRecovery'
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
  readonly captions: ImageCaption
  readonly inspectWritingFiles: () => Promise<ModelFiles>
}
export function createBrowserServices(): WriterServices {
  return {
    workspace: createBrowserWorkspace(),
    captions: createImageCaption(),
    inspectWritingFiles: () => inspectModelFiles('writing'),
    assistant: createLocalAssistant({
      createWorker: () =>
        new Worker(new URL('../features/assistance/adapters/model.worker.ts', import.meta.url), {
          type: 'module',
        }),
      removeCache: removeModelCache,
    }),
  }
}
