export interface WriterCommand {
  id: string
  label: string
  keys?: string
  characterKey?: '?'
  enabled?: boolean
  run: () => unknown
}

export function shortcutStroke(event: KeyboardEvent): string | null {
  if (event.isComposing || event.altKey || (event.metaKey && event.ctrlKey)) return null
  const key = event.key.toLowerCase()
  if (['shift', 'control', 'meta', 'alt'].includes(key)) return null
  return `${event.metaKey || event.ctrlKey ? 'Mod+' : ''}${event.shiftKey ? 'Shift+' : ''}${key}`
}

export function shortcutLabel(keys: string, mac: boolean): string {
  return keys.replaceAll('Mod', mac ? '⌘' : 'Ctrl').replaceAll('+', ' + ')
}

export function characterShortcut(event: KeyboardEvent): '?' | null {
  if (
    event.key !== '?' ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.isComposing ||
    event.repeat
  )
    return null
  const targets = [event.target, ...event.composedPath()]
  if (
    targets.some(
      (target) =>
        target instanceof HTMLElement &&
        (target.isContentEditable || target.matches('input, textarea, select')),
    )
  )
    return null
  return '?'
}

export function commandShortcutLabel(command: WriterCommand, mac: boolean): string {
  return [command.characterKey, command.keys && shortcutLabel(command.keys, mac)]
    .filter(Boolean)
    .join(' or ')
}
