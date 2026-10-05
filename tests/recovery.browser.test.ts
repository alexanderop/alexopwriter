import { expect, it } from 'vitest'
import { deleteDatabase } from './helpers/indexedDb'
import { indexedDbRecovery } from '../src/features/documents/adapters/indexedDbRecovery'
import { testWorkspace as createWorkspace } from './support/workspace'
it('preserves independent tab branches in real IndexedDB and rejects older revision writes', async () => {
  const name = `alexopwriter-recovery-test-${crypto.randomUUID()}`
  const first = indexedDbRecovery(name)
  const second = indexedDbRecovery(name)
  try {
    await Promise.all([
      first.put({
        id: 'shared',
        actor: 'tab-a',
        name: 'essay.md',
        text: 'First tab',
        revision: 3,
        updatedAt: 10,
      }),
      second.put({
        id: 'shared',
        actor: 'tab-b',
        name: 'essay.md',
        text: 'Second tab',
        revision: 4,
        updatedAt: 11,
      }),
    ])
    await first.put({
      id: 'shared',
      actor: 'tab-a',
      name: 'essay.md',
      text: 'Stale text',
      revision: 2,
      updatedAt: 12,
    })
    const records = await second.list()
    expect(records.map((row) => row.text).sort()).toEqual(['First tab', 'Second tab'])
    const workspace = createWorkspace({ recovery: first, actor: 'reload' })
    await workspace.initialize()
    const restored = workspace.snapshot()
    expect(restored.documents.map((doc) => doc.text).sort()).toEqual(['First tab', 'Second tab'])
    expect(restored.documents.every((doc) => !doc.hasDiskBinding)).toBe(true)
    expect(restored.documents.find((doc) => doc.id === restored.activeId)?.text).toBe('Second tab')
    expect(restored.documents.some((doc) => doc.name.includes('recovered copy'))).toBe(true)
    await workspace.dispose()
    expect(await second.list()).toHaveLength(2)
  } finally {
    first.close()
    second.close()
    await deleteDatabase(name)
  }
})
it('shows only the latest sequential recovery while retaining concurrent sibling edits', async () => {
  const name = `alexopwriter-lineage-test-${crypto.randomUUID()}`
  const inspection = indexedDbRecovery(name)
  const first = createWorkspace({
    recovery: indexedDbRecovery(name),
    actor: 'first',
  })
  const second = createWorkspace({
    recovery: indexedDbRecovery(name),
    actor: 'second',
  })
  const sibling = createWorkspace({
    recovery: indexedDbRecovery(name),
    actor: 'sibling',
  })
  const latest = createWorkspace({
    recovery: indexedDbRecovery(name),
    actor: 'latest',
  })
  const restored = createWorkspace({
    recovery: indexedDbRecovery(name),
    actor: 'restored',
  })
  try {
    await first.create('essay.md', 'First version')
    await second.initialize()
    await sibling.initialize()
    const secondId = second.snapshot().activeId
    const siblingId = sibling.snapshot().activeId
    if (!secondId || !siblingId) throw new Error('Expected recovered documents')
    second.edited(secondId, 'Sequential next version')
    await second.flush()
    await latest.initialize()
    expect(latest.snapshot().documents.map((doc) => doc.text)).toEqual(['Sequential next version'])
    expect(await inspection.list()).toHaveLength(2)
    sibling.edited(siblingId, 'Concurrent sibling version')
    await sibling.flush()
    await restored.initialize()
    expect(
      restored
        .snapshot()
        .documents.map((doc) => doc.text)
        .sort(),
    ).toEqual(['Concurrent sibling version', 'Sequential next version'])
    expect(await inspection.list()).toHaveLength(3)
  } finally {
    await Promise.all([
      first.dispose(),
      second.dispose(),
      sibling.dispose(),
      latest.dispose(),
      restored.dispose(),
    ])
    inspection.close()
    await deleteDatabase(name)
  }
})
it('retains a parent branch updated beyond the revision its successor superseded', async () => {
  const name = `alexopwriter-parent-test-${crypto.randomUUID()}`
  const first = createWorkspace({
    recovery: indexedDbRecovery(name),
    actor: 'first',
  })
  const second = createWorkspace({
    recovery: indexedDbRecovery(name),
    actor: 'second',
  })
  const restored = createWorkspace({
    recovery: indexedDbRecovery(name),
    actor: 'restored',
  })
  try {
    await first.create('essay.md', 'Original')
    await second.initialize()
    const firstId = first.snapshot().activeId
    const secondId = second.snapshot().activeId
    if (!firstId || !secondId) throw new Error('Expected documents')
    second.edited(secondId, 'Successor edit')
    await second.flush()
    first.edited(firstId, 'Original tab still editing')
    await first.flush()
    await restored.initialize()
    expect(
      restored
        .snapshot()
        .documents.map((doc) => doc.text)
        .sort(),
    ).toEqual(['Original tab still editing', 'Successor edit'])
  } finally {
    await Promise.all([first.dispose(), second.dispose(), restored.dispose()])
    await deleteDatabase(name)
  }
})
it('loads old records with defaults and retains different library states of identical branches', async () => {
  const name = `alexopwriter-library-${crypto.randomUUID()}`
  const storage = indexedDbRecovery(name)
  const workspace = createWorkspace({ recovery: indexedDbRecovery(name), actor: 'library' })
  const reloaded = createWorkspace({ recovery: indexedDbRecovery(name), actor: 'reload' })
  try {
    const legacy = {
      id: 'same',
      actor: 'old',
      name: 'draft.md',
      text: 'valuable',
      revision: 0,
      updatedAt: 1,
    }
    await storage.put(legacy)
    await storage.put({
      ...legacy,
      actor: 'other',
      folder: 'Novel',
      favorite: true,
      trashedAt: 2,
      updatedAt: 2,
    })
    expect((await storage.list()).find((record) => record.actor === 'old')).toEqual(legacy)
    await workspace.initialize()
    expect(workspace.snapshot().documents.find((doc) => doc.trashedAt === null)).toMatchObject({
      folder: '',
      favorite: false,
      trashedAt: null,
    })
    expect(workspace.snapshot().documents).toHaveLength(2)
    const active = workspace.snapshot().activeId
    if (!active) throw new Error('Nontrashed branch must remain active')
    workspace.moveToFolder(active, 'Essays')
    await workspace.flush()
    await reloaded.initialize()
    expect(reloaded.snapshot().documents).toHaveLength(2)
    expect(reloaded.snapshot().documents.filter((doc) => doc.trashedAt === null)).toHaveLength(1)
    expect(
      reloaded.snapshot().documents.find((doc) => doc.id === reloaded.snapshot().activeId),
    ).toMatchObject({ text: 'valuable', folder: 'Essays' })
  } finally {
    await workspace.dispose()
    await reloaded.dispose()
    storage.close()
    await deleteDatabase(name)
  }
})

it('keeps a concurrently edited branch outside Trash when another tab trashes its ancestor', async () => {
  const name = `alexopwriter-trash-branch-${crypto.randomUUID()}`
  const first = createWorkspace({ recovery: indexedDbRecovery(name), actor: 'first' })
  const second = createWorkspace({ recovery: indexedDbRecovery(name), actor: 'second' })
  const reloaded = createWorkspace({ recovery: indexedDbRecovery(name), actor: 'reload' })
  try {
    await first.create('draft.md', 'Original')
    await second.initialize()
    const firstId = first.snapshot().activeId
    const secondId = second.snapshot().activeId
    if (!firstId || !secondId) throw new Error('Expected documents')
    second.trash(secondId)
    await second.flush()
    first.edited(firstId, 'New work in original tab')
    await first.flush()
    await reloaded.initialize()
    expect(reloaded.snapshot().documents).toHaveLength(2)
    expect(
      reloaded.snapshot().documents.find((doc) => doc.id === reloaded.snapshot().activeId),
    ).toMatchObject({ text: 'New work in original tab', trashedAt: null })
    expect(reloaded.snapshot().documents.find((doc) => doc.trashedAt !== null)?.text).toBe(
      'Original',
    )
  } finally {
    await first.dispose()
    await second.dispose()
    await reloaded.dispose()
    await deleteDatabase(name)
  }
})
