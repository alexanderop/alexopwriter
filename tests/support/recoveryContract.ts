import { expect, it } from 'vitest'
import type { RecoveryRecord, RecoveryStore } from '../../src/features/documents'

export function recoveryContract(create: () => { store: RecoveryStore; cleanup: () => Promise<void> }) {
  const base: RecoveryRecord = {
    id: 'draft', actor: 'one', name: 'draft.md', text: 'new', revision: 3,
    updatedAt: 100, parent: { actor: 'parent', revision: 2 },
  }
  it('round-trips independent branches and rejects older revisions', async () => {
    const { store, cleanup } = create()
    try {
      await store.put(base)
      await store.put({ ...base, revision: 1, text: 'old' })
      await store.put({ ...base, actor: 'two', text: 'branch' })
      expect([...await store.list()].sort((a, b) => a.actor.localeCompare(b.actor))).toEqual([
        base, { ...base, actor: 'two', text: 'branch' },
      ])
      await store.put({ ...base, text: 'equal revision' })
      expect((await store.list()).find(row => row.actor === 'one')?.text).toBe('equal revision')
    } finally { store.close(); await cleanup() }
  })
  it('keeps tuple identities distinct and isolates caller mutations', async () => {
    const { store, cleanup } = create()
    try {
      const input = { ...base, id: 'a:b', actor: 'c' }
      await store.put(input)
      input.text = 'mutated'
      await store.put({ ...base, id: 'a', actor: 'b:c', text: 'other' })
      const rows = [...await store.list()]
      rows.length = 0
      const persisted = await store.list()
      expect(persisted).toHaveLength(2)
      expect(persisted.find(row => row.id === 'a:b')).toEqual({ ...base, id: 'a:b', actor: 'c' })
    } finally { store.close(); await cleanup() }
  })
}
