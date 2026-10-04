import { SIMPLER_PHRASES } from './writingReviewRules.ts'

export type WritingIssue = {
  readonly id: string
  readonly from: number
  readonly to: number
  readonly text: string
  readonly message: string
  readonly replacement?: string
  readonly kind: 'repeated-word' | 'simpler-phrase' | 'long-sentence'
}

function proseOnly(text: string): string {
  return text.replaceAll(
    /(^[ \t]*(`{3,}|~{3,})[^\n]*\n)[\s\S]*?(?:^[ \t]*\2[ \t]*$|(?![\s\S]))|`+[^`\n]*`+|\]\([^\n)]*\)|https?:\/\/[^\s<>]+/gm,
    (match) => match.replaceAll(/[^\n]/g, ' '),
  )
}

export function checkWriting(text: string): readonly WritingIssue[] {
  const prose = proseOnly(text)
  const issues: WritingIssue[] = []
  const add = (
    kind: WritingIssue['kind'],
    from: number,
    to: number,
    message: string,
    replacement?: string,
  ) => {
    const issue = {
      id: `${kind}:${from}:${to}`,
      kind,
      from,
      to,
      text: text.slice(from, to),
      message,
    }
    issues.push(replacement === undefined ? issue : { ...issue, replacement })
  }
  for (const match of prose.matchAll(/\b([\p{L}]+)([ \t]+)\1\b/giu)) {
    const word = match[1]
    if (word !== undefined)
      add(
        'repeated-word',
        match.index,
        match.index + match[0].length,
        'This word appears twice in a row.',
        word,
      )
  }
  for (const rule of SIMPLER_PHRASES) {
    const pattern = new RegExp(`\\b${rule.phrase}\\b`, 'gi')
    for (const match of prose.matchAll(pattern)) {
      const replacement = /^[A-Z]/.test(match[0])
        ? rule.replacements[0].charAt(0).toUpperCase() +
          rule.replacements[0].slice(1)
        : rule.replacements[0]
      add(
        'simpler-phrase',
        match.index,
        match.index + match[0].length,
        `Consider “${replacement}” for simpler wording.`,
        replacement,
      )
    }
  }
  for (const match of prose.matchAll(/[^.!?\n]+[.!?]?/g)) {
    const words = match[0].match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []
    if (words.length <= 35) continue
    const first = match[0].search(/\S/)
    if (first >= 0)
      add(
        'long-sentence',
        match.index + first,
        match.index + match[0].trimEnd().length,
        `This sentence has ${words.length} words. Consider splitting it.`,
      )
  }
  return issues.sort((a, b) => a.from - b.from || a.to - b.to)
}
