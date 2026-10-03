import { browserFiles, type DiskBinding, type FileAccess } from './files'
import {
  dexieRecovery,
  type RecoveryRecord,
  type RecoveryStore,
} from './recovery'
export type DocumentSnapshot = {
  readonly id: string
  readonly name: string
  readonly text: string
  readonly revision: number
  readonly recoveryStatus: string
  readonly diskStatus: string
  readonly hasDiskBinding: boolean
}
export type WorkspaceSnapshot = {
  readonly documents: readonly DocumentSnapshot[]
  readonly activeId: string | null
  readonly error: string | null
}
type DocumentState = {
  id: string
  recoveryId: string
  parent: RecoveryRecord['parent']
  name: string
  text: string
  revision: number
  recoveredRevision: number
  recoveryStatus: string
  diskStatus: string
  binding: DiskBinding | null
  baseline: string
  diskRevision: number
}
export type WorkspaceOptions = {
  recovery?: RecoveryStore
  files?: FileAccess
  actor?: string
  id?: () => string
  now?: () => number
  recoveryDelay?: number
}
export type Workspace = {
  subscribe(listener: (snapshot: WorkspaceSnapshot) => void): () => void
  snapshot(): WorkspaceSnapshot
  initialize(): Promise<void>
  create(name?: string, text?: string): Promise<void>
  open(): Promise<void>
  importFile(file: File): Promise<void>
  activate(id: string): void
  edited(id: string, text: string): void
  rename(id: string, name: string): void
  save(id: string): Promise<void>
  download(id: string): void
  flush(): Promise<void>
  dispose(): Promise<void>
}
type DestinationReady = { kind: 'ready'; target: DiskBinding | null }
type DestinationFailed = { kind: 'failed'; cause: Error }
export function createWorkspace(options: WorkspaceOptions = {}): Workspace {
  const recovery = options.recovery ?? dexieRecovery()
  const files = options.files ?? browserFiles()
  const nextId = options.id ?? (() => crypto.randomUUID())
  const actor = options.actor ?? crypto.randomUUID()
  const now = options.now ?? Date.now
  const documents = new Map<string, DocumentState>()
  const listeners = new Set<(snapshot: WorkspaceSnapshot) => void>()
  let diskWork: Promise<void> = Promise.resolve()
  let activeId: string | null = null
  let error: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let recoveryWork: Promise<void> = Promise.resolve()
  let initialization: Promise<void> | undefined
  let disposed = false

  function snapshot(): WorkspaceSnapshot {
    return {
      documents: [...documents.values()].map((doc) => ({
        id: doc.id,
        name: doc.name,
        text: doc.text,
        revision: doc.revision,
        recoveryStatus: doc.recoveryStatus,
        diskStatus: doc.diskStatus,
        hasDiskBinding: doc.binding !== null,
      })),
      activeId,
      error,
    }
  }
  function emit() {
    if (!disposed) for (const listener of listeners) listener(snapshot())
  }
  function report(cause: unknown) {
    error =
      cause instanceof Error
        ? cause.message
        : 'The operation could not be completed.'
    emit()
  }
  function append(
    name: string,
    text: string,
    disk: DiskBinding | null,
    id = nextId(),
  ): DocumentState {
    const doc: DocumentState = {
      id,
      recoveryId: id,
      parent: undefined,
      name,
      text,
      revision: 0,
      recoveredRevision: -1,
      recoveryStatus: 'Saving draft…',
      diskStatus: disk ? 'Saved to disk' : 'Not saved to disk',
      binding: disk,
      baseline: text,
      diskRevision: disk ? 0 : -1,
    }
    documents.set(id, doc)
    activeId = id
    error = null
    emit()
    return doc
  }
  async function persist() {
    for (const doc of documents.values()) {
      if (doc.recoveredRevision === doc.revision) continue
      const revision = doc.revision
      const record: RecoveryRecord = {
        id: doc.recoveryId,
        actor: `${actor}:${doc.id}`,
        name: doc.name,
        text: doc.text,
        revision,
        updatedAt: now(),
      }
      if (doc.parent) record.parent = doc.parent
      try {
        await recovery.put(record)
        doc.recoveredRevision = revision
        doc.recoveryStatus =
          doc.revision === revision ? 'Draft saved in browser' : 'Saving draft…'
      } catch (cause) {
        doc.recoveryStatus = 'Browser recovery failed'
        error =
          cause instanceof Error
            ? cause.message
            : 'The operation could not be completed.'
      }
      emit()
    }
  }
  function flush(): Promise<void> {
    clearTimeout(timer)
    timer = undefined
    recoveryWork = recoveryWork.then(persist, persist)
    return recoveryWork
  }
  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(() => {
      flush().catch(report)
    }, options.recoveryDelay ?? 250)
  }
  function changed(doc: DocumentState) {
    doc.revision += 1
    doc.recoveryStatus = 'Saving draft…'
    doc.diskStatus = doc.binding ? 'Unsaved changes' : 'Not saved to disk'
    error = null
    schedule()
    emit()
  }
  async function restore() {
    try {
      const records = await recovery.list()
      const originalActive = activeId
      const seen = new Set<string>()
      const superseded = new Set(
        records.flatMap((record) =>
          record.parent
            ? [
                JSON.stringify([
                  record.id,
                  record.parent.actor,
                  record.parent.revision,
                ]),
              ]
            : [],
        ),
      )
      for (const record of [...records].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      )) {
        if (
          superseded.has(
            JSON.stringify([record.id, record.actor, record.revision]),
          )
        )
          continue

        const identity = JSON.stringify([record.id, record.name, record.text])
        if (seen.has(identity)) continue
        seen.add(identity)
        const competing = [...documents.values()].some(
          (doc) => doc.id === record.id,
        )
        const id = competing ? nextId() : record.id
        const name = competing ? `${record.name} (recovered copy)` : record.name
        const doc = append(name, record.text, null, id)
        doc.recoveryId = record.id
        doc.parent = { actor: record.actor, revision: record.revision }
        doc.revision = record.revision
        doc.recoveredRevision = record.revision
        doc.recoveryStatus = 'Draft saved in browser'
      }
      if (originalActive !== null) activeId = originalActive
      else activeId = documents.keys().next().value ?? null
      emit()
    } catch (cause) {
      report(cause)
    }
  }
  async function write(
    doc: DocumentState,
    target: DiskBinding,
    baseline: string,
  ) {
    const text = doc.text
    const revision = doc.revision
    doc.diskStatus = 'Saving to disk…'
    emit()
    try {
      if ((await target.read()) !== baseline) {
        doc.diskStatus =
          'File changed on disk. Download a copy to keep both versions.'
        emit()
        return
      }
      await target.write(text)
      doc.binding = target
      doc.baseline = text
      doc.diskRevision = revision
      doc.diskStatus =
        doc.revision === revision ? 'Saved to disk' : 'Unsaved changes'
    } catch (cause) {
      doc.diskStatus = 'Disk save failed. Your edits are still here.'
      error =
        cause instanceof Error
          ? cause.message
          : 'The operation could not be completed.'
    }
    emit()
  }
  function save(id: string): Promise<void> {
    const doc = documents.get(id)
    if (!doc || disposed) return Promise.resolve()

    const destination = (
      doc.binding ? Promise.resolve(doc.binding) : files.saveAs(doc.name)
    ).then(
      (target): DestinationReady => ({ kind: 'ready', target }),
      (cause: unknown): DestinationFailed => ({
        kind: 'failed',
        cause:
          cause instanceof Error
            ? cause
            : new Error('Could not select a destination.'),
      }),
    )
    const previous = diskWork
    const work = previous.then(async () => {
      try {
        const result = await destination
        if (result.kind === 'failed') throw result.cause
        const target = result.target
        if (!target) {
          doc.diskStatus = 'Use Download copy to export this draft'
          emit()
          return
        }
        const baseline =
          doc.binding === target ? doc.baseline : await target.read()
        await write(doc, target, baseline)
      } catch (cause) {
        doc.diskStatus = 'Disk save failed. Your edits are still here.'
        report(cause)
      }
    })
    diskWork = work
    return work
  }
  return {
    snapshot,
    subscribe(listener) {
      listeners.add(listener)
      listener(snapshot())
      return () => {
        listeners.delete(listener)
      }
    },
    initialize() {
      initialization ??= restore()
      return initialization
    },
    async create(name = 'Untitled.md', text = '') {
      if (disposed) return
      append(name, text, null)
      await flush()
    },
    async open() {
      if (disposed) return
      try {
        const picked = await files.open()
        if (picked) {
          append(picked.name, picked.text, picked.binding)
          await flush()
        }
      } catch (cause) {
        report(cause)
      }
    },
    async importFile(file) {
      try {
        const text = await file.text()
        if (!disposed) {
          append(file.name, text, null)
          await flush()
        }
      } catch (cause) {
        report(cause)
      }
    },
    activate(id) {
      if (documents.has(id)) {
        activeId = id
        emit()
      }
    },
    edited(id, text) {
      const doc = documents.get(id)
      if (doc && !disposed && doc.text !== text) {
        doc.text = text
        changed(doc)
      }
    },
    rename(id, name) {
      const doc = documents.get(id)
      if (doc && name.trim() && doc.name !== name.trim()) {
        doc.name = name.trim()
        changed(doc)
      }
    },
    save,
    download(id) {
      const doc = documents.get(id)
      if (!doc) return
      try {
        files.download(doc.name, doc.text)
      } catch (cause) {
        report(cause)
      }
    },
    flush,
    async dispose() {
      await flush()
      await diskWork
      disposed = true
      recovery.close()
      listeners.clear()
    },
  }
}
