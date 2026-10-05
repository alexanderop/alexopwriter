import { expect, it } from 'vitest'
import { inspectArchitecture } from '../tooling/architecture'
const root = '/writer'
const check = (source: string, file = 'features/documents/application/workspace.ts') =>
  inspectArchitecture(source, `${root}/src/${file}`, root)
it.each([
  "import { files } from '../adapters/browserFiles'",
  "export { files } from '../adapters/browserFiles'",
  "import type { Recovery } from '@/features/documents/adapters/recovery'",
  "type Recovery = import('../adapters/recovery').Recovery",
  "const adapter = import('../adapters/recovery')",
  "const adapter = require('../adapters/recovery')",
  "import adapter = require('../adapters/recovery')",
  "const path = import.meta.resolve('../adapters/recovery')",
  "const modules = import.meta.glob('../**/*.ts')",
  "const modules = import.meta['glob']('../**/*.ts')",
  'const module = import(variable)',
  'const now = Date.now',
  'const random = Math.random',
  'const { random } = Math',
  'const id = crypto.randomUUID()',
  'type Upload = File',
  'const timer = setTimeout(task, 1)',
  'const root = globalThis',
  "import { ref } from 'vue'",
  "import { store } from '../../../shared/storage/indexedDb'",
])('rejects core escape: %s', (source) => {
  expect(check(source).length).toBeGreaterThan(0)
})
it.each([
  [
    'features/documents/ui/List.vue',
    '<script lang="ts" src="../../assistance/domain/assistant.ts" />',
  ],
  ['features/documents/application/workspace.ts', 'import { load } from "../browserHelper"'],
  [
    'features/documents/ui/List.vue',
    '<script setup lang="ts">import { assistant } from "../../assistance"</script>',
  ],
  ['shared/storage/store.ts', 'export * from "../../features/documents"'],
  [
    'app/WriterPage.vue',
    '<script setup lang="ts">import { store } from "../features/documents/adapters/recovery"</script>',
  ],
  ['features/documents/domain/document.ts', 'import type { Port } from "../application/ports"'],
  ['features/documents/index.ts', 'export * from "./adapters/recovery"'],
  ['app/application/session.ts', 'import { services } from "../bootstrap"'],
])('rejects forbidden dependency in %s', (file, source) => {
  expect(check(source, file).length).toBeGreaterThan(0)
})
it('resolves configured aliases before checking ownership', () => {
  expect(
    inspectArchitecture(
      'import type { Model } from "#assist/domain/model"',
      `${root}/src/features/documents/application/workspace.ts`,
      root,
      { baseUrl: root, paths: { '#assist/*': ['src/features/assistance/*'] } },
    ),
  ).not.toEqual([])
})
it.each([
  [
    'features/documents/application/workspace.ts',
    'import type { Document } from "../domain/document"; export function label(document: Document) { return document.name }',
  ],
  [
    'features/documents/domain/document.ts',
    'export function words(text: string) { return Math.max(0, text.length) }',
  ],
  [
    'features/documents/adapters/recovery.ts',
    'import { store } from "../../../shared/storage/indexedDb"',
  ],
  ['app/bootstrap.ts', 'import { files } from "../features/documents/adapters/browserFiles"'],
  [
    'app/bootstrap.ts',
    'new Worker(new URL("../features/assistance/adapters/model.worker.ts", import.meta.url))',
  ],
  ['app/application/session.ts', 'import type { Workspace } from "../../features/documents"'],
  [
    'app/WriterPage.vue',
    '<script setup lang="ts">import { DocumentList } from "../features/documents/ui"</script>',
  ],
])('allows owned dependencies in %s', (file, source) => {
  expect(check(source, file)).toEqual([])
})

it('permits only the browser-free Markdown parser inside the reading domain', () => {
  expect(
    check("import MarkdownIt from 'markdown-it'", 'features/reading/domain/markdown.ts'),
  ).toEqual([])
  expect(
    check(
      "import type Token from 'markdown-it/lib/token.mjs'",
      'features/reading/domain/markdown.ts',
    ),
  ).toEqual([])
  expect(
    check("import { ref } from 'vue'", 'features/reading/domain/markdown.ts').length,
  ).toBeGreaterThan(0)
  expect(
    check("import MarkdownIt from 'markdown-it'", 'features/documents/domain/document.ts').length,
  ).toBeGreaterThan(0)
})
