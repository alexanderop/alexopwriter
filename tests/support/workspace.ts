import {
  createWorkspace,
  type WorkspaceDependencies,
  type RecoveryStore,
  type RecoveryRecord,
} from '../../src/features/documents'
export function memoryRecovery(): RecoveryStore {
  const rows = new Map<string, RecoveryRecord>()
  return {
    async list() {
      return structuredClone([...rows.values()])
    },
    async put(record) {
      const key = JSON.stringify([record.id, record.actor])
      const previous = rows.get(key)
      if (!previous || previous.revision <= record.revision) rows.set(key, structuredClone(record))
    },
    close() {},
  }
}
export function manualScheduler() {
  const tasks = new Set<() => void>()
  return {
    schedule(_delay: number, task: () => void) {
      tasks.add(task)
      return () => {
        tasks.delete(task)
      }
    },
    run() {
      const pending = [...tasks]
      tasks.clear()
      pending.forEach((task) => task())
    },
    pending: () => tasks.size,
  }
}
export function testWorkspace(options: Partial<WorkspaceDependencies> = {}) {
  let id = 0
  return createWorkspace({
    recovery: memoryRecovery(),
    files: {
      async open() {
        return null
      },
      async saveAs() {
        return null
      },
      download() {},
    },
    actor: 'test',
    id: () => `${options.actor ?? 'document'}-${++id}`,
    now: () => 100,
    scheduler: manualScheduler(),
    ...options,
  })
}
