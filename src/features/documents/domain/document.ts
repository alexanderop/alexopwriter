export type RecoveryRecord = {
  readonly id: string
  readonly actor: string
  readonly name: string
  readonly text: string
  readonly revision: number
  readonly updatedAt: number
  readonly folder?: string
  readonly favorite?: boolean
  readonly trashedAt?: number | null
  readonly parent?: { readonly actor: string; readonly revision: number } | undefined
}
export type RecoveryStatus =
  | { readonly kind: 'pending' }
  | { readonly kind: 'saved'; readonly revision: number }
  | { readonly kind: 'failed' }
export type DiskStatus =
  | { readonly kind: 'unbound' }
  | { readonly kind: 'saved'; readonly revision: number }
  | { readonly kind: 'dirty' }
  | { readonly kind: 'saving'; readonly revision: number }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'download-required' }
export type DocumentSnapshot = {
  readonly folder: string
  readonly favorite: boolean
  readonly trashedAt: number | null
  readonly updatedAt: number
  readonly id: string
  readonly name: string
  readonly text: string
  readonly revision: number
  readonly recoveryStatus: RecoveryStatus
  readonly diskStatus: DiskStatus
  readonly hasDiskBinding: boolean
}
export function hasUnsecuredChanges(document: DocumentSnapshot): boolean {
  return (
    document.recoveryStatus.kind !== 'saved' ||
    (document.hasDiskBinding && document.diskStatus.kind !== 'saved')
  )
}
