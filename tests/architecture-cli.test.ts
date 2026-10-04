import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

const project = process.cwd()
function fixture(files: Record<string, string>) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'writer-boundaries-')))
  writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '#feature/*': ['src/features/new-feature/*'] } } }))
  for (const [file, text] of Object.entries(files)) {
    const destination = path.join(root, 'src', file)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, text)
  }
  return root
}
function lint(root: string, vue: boolean) {
  return spawnSync(process.execPath, [
    '--experimental-strip-types',
    path.join(project, vue ? 'node_modules/eslint/bin/eslint.js' : 'node_modules/oxlint/bin/oxlint'),
    '--config', path.join(project, vue ? 'eslint.config.mjs' : '.oxlintrc.json'),
    ...(vue ? ['src/**/*.vue', '--format', 'json'] : ['src', '--format', 'json']),
  ], { cwd: root, encoding: 'utf8' })
}

it('enforces feature and shared ownership through the actual Oxlint plugin', () => {
  const files = {
    'shared/storage/app.ts': 'export * from "../../app"',
    'features/documents/ui/app.ts': 'export * from "../../../app/index"',
    'shared/ui/button/storage.ts': 'export * from "../../storage"',
    'shared/storage/ui.ts': 'export * from "../ui"',
    'features/documents/ui/radix.ts': 'export * from "@radix-ui/react-dialog"',
    'features/new-feature/ui/foreign.ts': 'export * from "../../documents"',
    'shared/storage/feature.ts': 'export * from "../../features/documents"',
    'features/documents/ui/reka.ts': 'export { Primitive } from "reka-ui"',
    'app/private.ts': 'export * from "../features/documents/domain/document"',
    'app/shared-private.ts': 'export * from "../shared/ui/button/styles"',
    'features/documents/ui/alias.ts': 'export * from "#feature/internal"',
    'features/new-feature/domain/browser.ts': 'export const now = Date.now()',
    'features/new-feature/ui/dynamic.ts': 'export const load = () => import("../../documents")',
    'features/new-feature/ui/glob.ts': 'export const modules = import.meta.glob("../../**/*.ts")',
  }
  const root = fixture(files)
  try {
    const result = lint(root, false)
    expect(result.status, result.stderr).toBe(1)
    const report = JSON.parse(result.stdout)
    for (const file of Object.keys(files)) {
      expect(report.diagnostics.some((d: { filename: string; code: string }) => d.filename === `src/${file}` && d.code === 'writer-architecture(boundaries)'), file).toBe(true)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('enforces the same boundaries and shared controls in real Vue files', () => {
  const files = {
    'features/new-feature/ui/ForeignPanel.vue': '<script setup lang="ts">import { workspace } from "../../documents"; void workspace</script><template><div /></template>',
    'app/RawButton.vue': '<template><button>Save</button></template>',
    'app/RawField.vue': '<template><input aria-label="Name" /></template>',
    'app/CustomColor.vue': '<template><BaseButton class="bg-red-500">Save</BaseButton></template>',
  }
  const root = fixture(files)
  try {
    const result = lint(root, true)
    expect(result.status, result.stderr).toBe(1)
    const reports = JSON.parse(result.stdout)
    for (const file of Object.keys(files)) {
      const report = reports.find((r: { filePath: string }) => r.filePath === path.join(root, 'src', file))
      expect(report?.messages.some((m: { ruleId: string }) => m.ruleId.startsWith('writer-')), file).toBe(true)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('accepts public APIs, owned modules, shared components, and the hidden file importer', () => {
  const root = fixture({
    'features/new-feature/domain/rule.ts': 'export const count = (text: string) => text.length',
    'features/new-feature/application/use.ts': 'export { count } from "../domain/rule"',
    'app/workflow.ts': 'export * from "../features/new-feature"',
    'shared/ui/button/index.ts': 'export { Primitive } from "reka-ui"',
    'app/GoodPanel.vue': '<script setup lang="ts">import { BaseButton } from "../shared/ui/button"</script><template><BaseButton>Save</BaseButton><input hidden type="file" /></template>',
  })
  try {
    for (const vue of [false, true]) {
      const result = lint(root, vue)
      expect(result.status, result.stdout + result.stderr).toBe(0)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
