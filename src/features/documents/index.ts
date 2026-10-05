export { createWorkspace, type Workspace, type WorkspaceSnapshot } from './application/workspace'
export type {
  WorkspaceDependencies,
  RecoveryStore,
  FileAccess,
  DiskBinding,
  Scheduler,
} from './application/ports'
export { hasUnsecuredChanges, type DocumentSnapshot, type RecoveryRecord } from './domain/document'
export { selectLibrary, type LibraryQuery } from './domain/library'
