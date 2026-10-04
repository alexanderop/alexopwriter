import { memoryRecovery } from './support/workspace'
import { describe, expect, it } from 'vitest'
import { testWorkspace as createWorkspace } from './support/workspace'
import type { DiskBinding, FileAccess } from '../src/features/documents'
import type { RecoveryRecord, RecoveryStore } from '../src/features/documents'
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Not initialized')
  }
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function fixture(binding: DiskBinding) {
  let id = 0
  const recovery = memoryRecovery()
  const files: FileAccess = {
    async open() {
      return { name: 'essay.md', text: await binding.read(), binding }
    },
    async saveAs() {
      return binding
    },
    download() {},
  }
  const workspace = createWorkspace({
    recovery,
    files,
    actor: 'test',
    id: () => `document-${++id}`,
  })
  return { workspace, recovery }
}
function activeId(workspace: ReturnType<typeof createWorkspace>): string {
  const id = workspace.snapshot().activeId
  if (!id) throw new Error('Expected an active document')
  return id
}
describe('document persistence workflows', () => {
  it('keeps disk save state truthful when downloading clean and edited copies', async () => {
    const { workspace } = fixture({
      async read() {
        return 'original'
      },
      async write() {},
    })
    try {
      await workspace.open()
      const id = activeId(workspace)
      workspace.download(id)
      expect(workspace.snapshot().documents[0]?.diskStatus.kind).toBe('saved')
      workspace.edited(id, 'edited copy')
      workspace.download(id)
      expect(workspace.snapshot().documents[0]?.diskStatus.kind).toBe('dirty')
      expect(workspace.snapshot().documents[0]?.text).toBe('edited copy')
    } finally {
      await workspace.dispose()
    }
  })

  it('keeps edits made during a save dirty and writes latest text on retry', async () => {
    let bytes = 'original'
    const started = deferred<void>()
    const release = deferred<void>()
    let block = true
    const { workspace } = fixture({
      async read() {
        return bytes
      },
      async write(text) {
        if (block) {
          started.resolve()
          await release.promise
          block = false
        }
        bytes = text
      },
    })
    try {
      await workspace.open()
      const id = activeId(workspace)
      workspace.edited(id, 'first edit')
      const saving = workspace.save(id)
      await started.promise
      workspace.edited(id, 'newer edit')
      release.resolve()
      await saving
      expect(bytes).toBe('first edit')
      expect(workspace.snapshot().documents[0]?.diskStatus.kind).toBe('dirty')
      await workspace.save(id)
      expect(bytes).toBe('newer edit')
      expect(workspace.snapshot().documents[0]?.diskStatus.kind).toBe('saved')
    } finally {
      release.resolve()
      await workspace.dispose()
    }
  })
  it('preserves edits after a write failure and recovers through retry', async () => {
    let bytes = 'original'
    let fail = true
    const { workspace, recovery } = fixture({
      async read() {
        return bytes
      },
      async write(text) {
        if (fail) throw new Error('Permission denied')
        bytes = text
      },
    })
    try {
      await workspace.open()
      const id = activeId(workspace)
      workspace.edited(id, 'valuable text')
      await workspace.save(id)
      await workspace.flush()
      expect(bytes).toBe('original')
      expect(workspace.snapshot().documents[0]?.text).toBe('valuable text')
      expect((await recovery.list())[0]?.text).toBe('valuable text')
      expect(workspace.snapshot().documents[0]?.diskStatus.kind).toContain('failed')
      fail = false
      await workspace.save(id)
      expect(bytes).toBe('valuable text')
    } finally {
      await workspace.dispose()
    }
  })
  it('finishes an old document save without touching the newly active document', async () => {
    let bytes = 'original'
    const started = deferred<void>()
    const release = deferred<void>()
    const { workspace } = fixture({
      async read() {
        return bytes
      },
      async write(text) {
        started.resolve()
        await release.promise
        bytes = text
      },
    })
    try {
      await workspace.open()
      const first = activeId(workspace)
      workspace.edited(first, 'first document')
      const saving = workspace.save(first)
      await started.promise
      await workspace.create('second.md', 'second document')
      const second = activeId(workspace)
      release.resolve()
      await saving
      expect(bytes).toBe('first document')
      expect(workspace.snapshot().activeId).toBe(second)
      expect(workspace.snapshot().documents.find((doc) => doc.id === second)?.text).toBe(
        'second document',
      )
    } finally {
      release.resolve()
      await workspace.dispose()
    }
  })
  it('keeps external disk edits and provides the unsaved local text for a copy', async () => {
    let bytes = 'original'
    const { workspace } = fixture({
      async read() {
        return bytes
      },
      async write(text) {
        bytes = text
      },
    })
    try {
      await workspace.open()
      workspace.edited(activeId(workspace), 'local edits')
      bytes = 'external edits'
      await workspace.save(activeId(workspace))
      expect(bytes).toBe('external edits')
      expect(workspace.snapshot().documents[0]?.text).toBe('local edits')
      expect(workspace.snapshot().documents[0]?.diskStatus.kind).toContain('conflict')
    } finally {
      await workspace.dispose()
    }
  })
  it('does not replace edits made while recovery is loading', async () => {
    const loaded = deferred<readonly RecoveryRecord[]>()
    const recovery: RecoveryStore = {
      list: () => loaded.promise,
      async put() {},
      close() {},
    }
    const workspace = createWorkspace({
      recovery,
      actor: 'new',
      id: () => 'new-document',
    })
    try {
      const initialization = workspace.initialize()
      await workspace.create('new.md', 'already typing')
      loaded.resolve([
        {
          id: 'old',
          actor: 'prior',
          name: 'old.md',
          text: 'old draft',
          revision: 2,
          updatedAt: 1,
        },
      ])
      await initialization
      expect(workspace.snapshot().activeId).toBe('new-document')
      expect(workspace.snapshot().documents.find((doc) => doc.id === 'new-document')?.text).toBe(
        'already typing',
      )
      expect(workspace.snapshot().documents).toHaveLength(2)
    } finally {
      await workspace.dispose()
    }
  })
})
