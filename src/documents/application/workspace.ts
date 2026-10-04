import type { DocumentSnapshot, RecoveryRecord, RecoveryStatus, DiskStatus } from '../domain/document'
import type { DiskBinding, WorkspaceDependencies } from './ports'
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
  recoveryStatus: RecoveryStatus
  diskStatus: DiskStatus
  binding: DiskBinding | null
  baseline: string
}
export type Workspace = {
  subscribe(listener: (snapshot: WorkspaceSnapshot) => void): () => void
  snapshot(): WorkspaceSnapshot
  initialize(): Promise<void>
  create(name?: string, text?: string): Promise<void>
  open(): Promise<void>
  importDocument(document: { name: string; text: string }): Promise<void>
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
export function createWorkspace(options: WorkspaceDependencies): Workspace {
  const recovery = options.recovery
  const files = options.files
  const nextId = options.id
  const actor = options.actor
  const now = options.now
  const documents = new Map<string, DocumentState>()
  const listeners = new Set<(snapshot: WorkspaceSnapshot) => void>()
  let diskWork: Promise<void> = Promise.resolve()
  let activeId: string | null = null
  let error: string | null = null
  let cancelRecovery: (() => void) | undefined
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
      recoveryStatus: { kind: 'pending' },
      diskStatus: disk ? { kind: 'saved', revision: 0 } : { kind: 'unbound' },
      binding: disk,
      baseline: text,
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
        ...(doc.parent ? { parent: doc.parent } : {}),
      }
      
      try {
        await recovery.put(record)
        doc.recoveredRevision = revision
        doc.recoveryStatus =
          doc.revision === revision ? { kind: 'saved', revision } : { kind: 'pending' }
      } catch (cause) {
        doc.recoveryStatus = { kind: 'failed' }
        error =
          cause instanceof Error
            ? cause.message
            : 'The operation could not be completed.'
      }
      emit()
    }
  }
  function flush(): Promise<void> {
    cancelRecovery?.()
    cancelRecovery = undefined
    recoveryWork = recoveryWork.then(persist, persist)
    return recoveryWork
  }
  function schedule() {
    cancelRecovery?.()
    cancelRecovery = options.scheduler.schedule(options.recoveryDelay ?? 250, () => {
      flush().catch(report)
    })
  }
  function changed(doc: DocumentState) {
    doc.revision += 1
    doc.recoveryStatus = { kind: 'pending' }
    doc.diskStatus = doc.binding ? { kind: 'dirty' } : { kind: 'unbound' }
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
        doc.recoveryStatus = { kind: 'saved', revision: record.revision }
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
    doc.diskStatus = { kind: 'saving', revision }
    emit()
    try {
      if ((await target.read()) !== baseline) {
        doc.diskStatus =
          { kind: 'conflict' }
        emit()
        return
      }
      await target.write(text)
      doc.binding = target
      doc.baseline = text
      doc.diskStatus =
        doc.revision === revision ? { kind: 'saved', revision } : { kind: 'dirty' }
    } catch (cause) {
      doc.diskStatus = { kind: 'failed' }
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
          doc.diskStatus = { kind: 'download-required' }
          emit()
          return
        }
        const baseline =
          doc.binding === target ? doc.baseline : await target.read()
        await write(doc, target, baseline)
      } catch (cause) {
        doc.diskStatus = { kind: 'failed' }
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
    async importDocument(document) {
      try {
        const { name, text } = document
        if (!disposed) {
          append(name, text, null)
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
