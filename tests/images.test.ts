import { expect, test } from 'vitest'
import { embeddedImages, imageAwareWordCount } from '../src/editor/images'
const image = '![Pasted image](data:image/png;base64,YQ==)'
test('embedded image markup excludes code examples and escaped syntax', () => {
  expect(embeddedImages(`${image}\n\n\`${image}\`\n\n\`\`\`md\n${image}\n\`\`\`\n\n\\${image}`)).toEqual([
    { from: 0, to: image.length, alt: 'Pasted image', url: 'data:image/png;base64,YQ==' },
  ])
})
test('word counts exclude embedded images while preserving surrounding words', () => {
  expect(imageAwareWordCount(`Before ${image} after`)).toBe(2)
  expect(imageAwareWordCount(image)).toBe(0)
})
