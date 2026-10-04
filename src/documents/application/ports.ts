import type { RecoveryRecord } from '../domain/document'

export type DiskBinding = {
  read(): Promise<string>
  write(text: string): Promise<void>
}
export type OpenedFile = {
  name: string
  text: string
  binding: DiskBinding | null
}
export type FileAccess = {
  open(): Promise<OpenedFile | null>
  saveAs(name: string): Promise<DiskBinding | null>
  download(name: string, text: string): void
}
export type RecoveryStore = {
  list(): Promise<readonly RecoveryRecord[]>
  put(record: RecoveryRecord): Promise<void>
  close(): void
}
export type Scheduler = {
  schedule(delay: number, task: () => void): () => void
}
export type WorkspaceDependencies = {
  readonly recovery: RecoveryStore
  readonly files: FileAccess
  readonly actor: string
  readonly id: () => string
  readonly now: () => number
  readonly scheduler: Scheduler
  readonly recoveryDelay?: number
}
