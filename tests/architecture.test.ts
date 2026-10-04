import { expect, it } from 'vitest'
import { inspectArchitecture } from '../tooling/architecture'
const root = '/writer'
const check = (source: string, file = 'documents/application/workspace.ts') => inspectArchitecture(source, `${root}/src/${file}`, root)
it.each([
  "import { files } from '../adapters/browserFiles'",
  "export { files } from '../adapters/browserFiles'",
  "import type { Recovery } from '@/documents/adapters/recovery'",
  "type Recovery = import('../adapters/recovery').Recovery",
  "const adapter = import('../adapters/recovery')",
  "const adapter = require('../adapters/recovery')",
  "import adapter = require('../adapters/recovery')",
  "const path = import.meta.resolve('../adapters/recovery')",
  "const modules = import.meta.glob('../**/*.ts')",
  "const modules = import.meta['glob']('../**/*.ts')",
  "const module = import(variable)",
  "const now = Date.now",
  "const random = Math.random",
  "const { random } = Math",
  "const id = crypto.randomUUID()",
  "type Upload = File",
  "const timer = setTimeout(task, 1)",
  "const root = globalThis",
  "import { ref } from 'vue'",
  "import { store } from '../../storage/indexedDb'",
])('rejects core escape: %s', source => { expect(check(source).length).toBeGreaterThan(0) })
it.each([
  ['documents/ui/List.vue', '<script lang="ts" src="../../assistance/domain/assistant.ts" />'],
  ['documents/application/workspace.ts', 'import { load } from "../browserHelper"'],
  ['documents/ui/List.vue', '<script setup lang="ts">import { assistant } from "../../assistance"</script>'],
  ['storage/store.ts', 'export * from "../documents"'],
  ['app/WriterPage.vue', '<script setup lang="ts">import { store } from "../documents/adapters/recovery"</script>'],
  ['documents/domain/document.ts', 'import type { Port } from "../application/ports"'],
  ['documents/index.ts', 'export * from "./adapters/recovery"'],
  ['app/application/session.ts', 'import { services } from "../bootstrap"'],
])('rejects forbidden dependency in %s', (file, source) => { expect(check(source, file).length).toBeGreaterThan(0) })
it('resolves configured aliases before checking ownership', () => {
  expect(inspectArchitecture('import type { Model } from "#assist/domain/model"', `${root}/src/documents/application/workspace.ts`, root,
    { baseUrl: root, paths: { '#assist/*': ['src/assistance/*'] } })).not.toEqual([])
})
it.each([
  ['documents/application/workspace.ts', 'import type { Document } from "../domain/document"; export function label(document: Document) { return document.name }'],
  ['documents/domain/document.ts', 'export function words(text: string) { return Math.max(0, text.length) }'],
  ['documents/adapters/recovery.ts', 'import { store } from "../../storage/indexedDb"'],
  ['app/bootstrap.ts', 'import { files } from "../documents/adapters/browserFiles"'],
  ['app/bootstrap.ts', 'new Worker(new URL("../assistance/adapters/model.worker.ts", import.meta.url))'],
  ['app/application/session.ts', 'import type { Workspace } from "../../documents"'],
  ['app/WriterPage.vue', '<script setup lang="ts">import { DocumentList } from "../documents/ui"</script>'],
])('allows owned dependencies in %s', (file, source) => { expect(check(source, file)).toEqual([]) })
