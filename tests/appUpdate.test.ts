import { expect, test } from 'vitest'
import { saveBeforeUpdate } from '../src/app/application/appUpdate'
import { testWorkspace as createWorkspace } from './support/workspace'
import type { RecoveryRecord, RecoveryStore } from '../src/features/documents'

function setup(put: RecoveryStore['put']) {
  return createWorkspace({
    recovery: {
      async list() {
        return []
      },
      put,
      close() {},
    },
    actor: 'update-test',
    id: () => 'draft',
    recoveryDelay: 60_000,
  })
}

test('updating flushes the latest draft before allowing a reload', async () => {
  let saved: RecoveryRecord | undefined
  const workspace = setup(async (record) => {
    saved = record
  })
  await workspace.create()
  workspace.edited('draft', 'Latest writing and ![image](data:image/png;base64,AA==)')
  await saveBeforeUpdate(workspace, () => false)
  expect(saved?.text).toBe(workspace.snapshot().documents[0]?.text)
  await workspace.dispose()
})

test('failed browser recovery prevents an update reload even when flush resolves', async () => {
  const workspace = setup(async () => {
    throw new Error('Storage full')
  })
  await workspace.create()
  await expect(saveBeforeUpdate(workspace, () => false)).rejects.toThrow('not saved')
  await workspace.dispose()
})

test('edits while saving prevent reload until the latest revision is saved', async () => {
  let duringSave = () => {}
  const workspace = setup(async () => {
    duringSave()
  })
  await workspace.create()
  workspace.edited('draft', 'First revision')
  duringSave = () => workspace.edited('draft', 'Newer revision')
  await expect(saveBeforeUpdate(workspace, () => false)).rejects.toThrow('not saved')
  duringSave = () => {}
  await expect(saveBeforeUpdate(workspace, () => false)).resolves.toBeUndefined()
  await workspace.dispose()
})

test('an image still being decoded prevents update reload', async () => {
  const workspace = setup(async () => {})
  await workspace.create()
  await expect(saveBeforeUpdate(workspace, () => true)).rejects.toThrow('still being pasted')
  await workspace.dispose()
})
