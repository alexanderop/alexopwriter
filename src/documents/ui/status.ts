import type { DiskStatus, RecoveryStatus } from '../domain/document'
export function recoveryStatusText(status: RecoveryStatus): string {
  switch (status.kind) {
    case 'pending': return 'Saving draft…'
    case 'saved': return 'Draft saved in browser'
    case 'failed': return 'Browser recovery failed'
  }
}
export function diskStatusText(status: DiskStatus): string {
  switch (status.kind) {
    case 'unbound': return 'Not saved to disk'
    case 'saved': return 'Saved to disk'
    case 'dirty': return 'Unsaved changes'
    case 'saving': return 'Saving to disk…'
    case 'conflict': return 'File changed on disk. Download a copy to keep both versions.'
    case 'failed': return 'Disk save failed. Your edits are still here.'
    case 'download-required': return 'Use Download copy to export this draft'
  }
}
