import type { Workspace } from '../../documents'

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
    document.recoveryStatus.kind !== 'saved',
  ))
    throw new Error('Your latest changes are not saved in this browser yet. Please try updating again.')
}
