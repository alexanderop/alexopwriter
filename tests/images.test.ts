import { expect, test } from 'vitest'
import { embeddedImages, imageAwareWordCount } from '../src/features/editor/images'
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

test('manual alt text roundtrips Markdown delimiters, backslashes and empty text', async () => {
  const { imageMarkdown } = await import('../src/features/editor/images')
  const url = 'data:image/png;base64,YQ=='
  for (const alt of ['A [label] and \\ path', '', 'bracket ] after [ before']) {
    expect(embeddedImages(imageMarkdown(alt, url))[0]?.alt).toBe(alt)
  }
  expect(embeddedImages(imageMarkdown('first\r\nsecond\nthird', url))[0]?.alt).toBe('first second third')
})
