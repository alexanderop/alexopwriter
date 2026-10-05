import type { WriterServices } from '../../src/app/bootstrap'
import { createImageCaption } from '../../src/features/assistance/adapters/imageCaption'
import { testWorkspace } from './workspace'
import { controlledAssistant } from './controlledAssistant'
export function createTestServices(overrides: Partial<WriterServices> = {}): WriterServices {
  return {
    documentExport: overrides.documentExport ?? { export: async () => {} },
    workspace: overrides.workspace ?? testWorkspace(),
    assistant: overrides.assistant ?? controlledAssistant().assistant,
    captions: overrides.captions ?? createImageCaption({ inspect: async () => 'absent' }),
    inspectWritingFiles: overrides.inspectWritingFiles ?? (async () => 'absent'),
  }
}
