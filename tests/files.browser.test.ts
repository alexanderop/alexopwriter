import { expect, it } from 'vitest'
import { deleteDatabase } from './helpers/indexedDb'
import { browserFiles } from '../src/documents/adapters/browserFiles'
import { indexedDbRecovery } from '../src/documents/adapters/indexedDbRecovery'
import { testWorkspace as createWorkspace } from './support/workspace'

it('writes through the production file adapter to OPFS and preserves conflicting external bytes', async () => {
  const id = crypto.randomUUID()
  const filename = `alexopwriter-adapter-${id}.md`
  const databaseName = `alexopwriter-adapter-${id}`
  const root = await navigator.storage.getDirectory()
  const handle = await root.getFileHandle(filename, { create: true })
  const recovery = indexedDbRecovery(databaseName)
  const workspace = createWorkspace({
    recovery,
    files: browserFiles({
      async open() {
        return [handle]
      },
      async save() {
        return handle
      },
    }),
  })
  try {
    const initial = await handle.createWritable()
    await initial.write('Initial file bytes')
    await initial.close()
    await workspace.open()
    const activeId = workspace.snapshot().activeId
    if (!activeId) throw new Error('Expected an opened document')
    expect(workspace.snapshot().documents[0]?.text).toBe('Initial file bytes')
    expect(workspace.snapshot().documents[0]?.hasDiskBinding).toBe(true)
    workspace.edited(activeId, 'Saved through the real browser adapter. 🌿')
    await workspace.save(activeId)
    expect(await (await handle.getFile()).text()).toBe(
      'Saved through the real browser adapter. 🌿',
    )
    expect(workspace.snapshot().documents[0]?.diskStatus.kind).toBe('saved')
    const external = await handle.createWritable()
    await external.write('External file change')
    await external.close()
    workspace.edited(activeId, 'Local edit to retain')
    await workspace.save(activeId)
    await workspace.flush()
    expect(await (await handle.getFile()).text()).toBe('External file change')
    expect(workspace.snapshot().documents[0]?.text).toBe('Local edit to retain')
    expect(workspace.snapshot().documents[0]?.diskStatus.kind).toContain(
      'conflict',
    )
    expect((await recovery.list())[0]?.text).toBe('Local edit to retain')
  } finally {
    await workspace.dispose()
    await deleteDatabase(databaseName)
    await root.removeEntry(filename)
  }
})
