import { expect, test } from 'vitest'
import { defaultWritingPreferences, parseWritingPreferences } from '../src/features/editor'
import { activePassage } from '../src/features/editor/domain/passage'

test('preferences reject unknown and out-of-range persisted values without losing valid options', () => {
  expect(
    parseWritingPreferences({
      font: 'serif',
      fontSize: 200,
      language: 'javascript:x',
      typewriter: true,
    }),
  ).toEqual({ ...defaultWritingPreferences, font: 'serif', typewriter: true })
  expect(parseWritingPreferences(null)).toEqual(defaultWritingPreferences)
})
test('paragraph focus respects blank lines, endpoints and an empty draft', () => {
  expect(activePassage('First.\nStill first.\n\nSecond.', 9, 'paragraph')).toEqual({
    from: 0,
    to: 19,
  })
  expect(activePassage('First.\n\nSecond.', 15, 'paragraph')).toEqual({ from: 8, to: 15 })
  expect(activePassage('First.\n\nSecond.', 7, 'paragraph')).toEqual({ from: 6, to: 8 })
  expect(activePassage('', 0, 'paragraph')).toEqual({ from: 0, to: 0 })
})
test('sentence focus respects punctuation and selects the next sentence at its boundary', () => {
  expect(activePassage('One. Two! Last?', 5, 'sentence')).toEqual({ from: 5, to: 10 })
  expect(activePassage('你好。再见！', 3, 'sentence')).toEqual({ from: 3, to: 6 })
})
