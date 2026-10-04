import type { Workspace } from './documents/workspace'

export type RegisterAppUpdate = (callbacks: {
  onNeedRefresh(): void
  onNeedReload(): void
}) => () => Promise<void>

export async function saveBeforeUpdate(
  workspace: Pick<Workspace, 'flush' | 'snapshot'>,
  hasPendingImages: () => boolean,
): Promise<void> {
  await workspace.flush()
  if (hasPendingImages())
    throw new Error('An image is still being pasted. Try updating again when it appears.')
  if (workspace.snapshot().documents.some((document) =>
    document.recoveryStatus !== 'Draft saved in browser',
  ))
    throw new Error('Your latest changes are not saved in this browser yet. Please try updating again.')
}
