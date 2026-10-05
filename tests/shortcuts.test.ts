import { expect, test } from 'vitest'
import { shortcutStroke, shortcutLabel, commandShortcutLabel } from '../src/app/shortcuts'

function key(overrides: Partial<KeyboardEvent>) {
  return {
    key: 'p',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    ...overrides,
  } as KeyboardEvent
}
test('command shortcuts normalize platform modifiers and preserve shift', () => {
  expect(shortcutStroke(key({ metaKey: true, shiftKey: true, key: 'P' }))).toBe('Mod+Shift+p')
  expect(shortcutStroke(key({ ctrlKey: true }))).toBe('Mod+p')
  expect(shortcutStroke(key({ key: 'z' }))).toBe('z')
  expect(shortcutLabel('Mod+k Mod+s', false)).toBe('Ctrl + k Ctrl + s')
})
test('typing composition, Alt combinations and modifier-only events do not dispatch commands', () => {
  expect(shortcutStroke(key({ isComposing: true, metaKey: true }))).toBeNull()
  expect(shortcutStroke(key({ altKey: true, ctrlKey: true }))).toBeNull()
  expect(shortcutStroke(key({ key: 'Meta', metaKey: true }))).toBeNull()
})

test('shortcut labels include the character alias alongside its typing-safe chord', () => {
  const command = {
    id: 'help',
    label: 'Help',
    keys: 'Mod+k Mod+s',
    characterKey: '?' as const,
    run: () => {},
  }
  expect(commandShortcutLabel(command, false)).toBe('? or Ctrl + k Ctrl + s')
  expect(commandShortcutLabel(command, true)).toBe('? or ⌘ + k ⌘ + s')
})
