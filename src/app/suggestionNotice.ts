import type { SuggestionNotice } from './application/suggestionSession'
export function suggestionNoticeText(notice: SuggestionNotice): string {
  switch (notice.kind) {
    case 'none':
      return ''
    case 'select':
      return 'Select a passage in your document first.'
    case 'images':
      return 'Select text without images to request writing help.'
    case 'changed':
      return 'Your document changed. Select the passage and try again.'
    case 'applied':
      return 'Suggestion applied. Undo will restore your original.'
    case 'stale':
      return 'Your document changed. Select the passage and request a fresh suggestion.'
    case 'error':
      return notice.message
  }
}
