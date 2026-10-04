import { describe, expect, it } from 'vitest'
import { checkWriting } from '../src/features/assistance/domain/review.ts'

describe('deterministic writing checks', () => {
  it('finds repeated words and offers a concrete correction', () => {
    const text = 'This is is useful.'
    const issue = checkWriting(text).find((item) => item.kind === 'repeated-word')
    expect(issue).toMatchObject({
      from: 5,
      to: 10,
      text: 'is is',
      replacement: 'is',
    })
  })

  it('reuses simpler phrase rules while preserving initial capitalisation and Unicode offsets', () => {
    const text = '🌱 In order to learn, utilize examples.'
    const issues = checkWriting(text).filter((item) => item.kind === 'simpler-phrase')
    expect(issues.map((issue) => issue.replacement)).toEqual(['To', 'use'])
    for (const issue of issues) expect(text.slice(issue.from, issue.to)).toBe(issue.text)
    expect(issues[0]?.from).toBe(3)
  })

  it('does not suggest edits inside fenced code, inline code or link destinations', () => {
    const text =
      '```ts\nutilize utilize\n```\n`in order to`\n[link](https://example.com/utilize)\nIn order to write.'
    expect(checkWriting(text).map((issue) => issue.text)).toEqual(['In order to'])
  })

  it('checks link labels and protects unclosed fenced code', () => {
    const text = '[utilize](https://example.com)\n~~~\nutilize utilize'
    expect(checkWriting(text).map((issue) => issue.text)).toEqual(['utilize'])
  })

  it('flags long prose sentences without an automatic rewrite', () => {
    const text = `${Array.from({ length: 36 }, (_, index) => `word${index}`).join(' ')}.`
    const issue = checkWriting(text).find((item) => item.kind === 'long-sentence')
    expect(issue?.text).toBe(text)
    expect(issue?.replacement).toBeUndefined()
    expect(issue?.message).toContain('36 words')
  })

  it('returns stable deterministic results and ignores normal text', () => {
    expect(checkWriting('Write clearly.')).toEqual([])
    expect(checkWriting('We utilize tools.')).toEqual(checkWriting('We utilize tools.'))
  })
})
