export type Passage = Readonly<{ from: number; to: number }>
export function activePassage(
  text: string,
  cursor: number,
  mode: 'sentence' | 'paragraph',
): Passage {
  const position = Math.max(0, Math.min(cursor, text.length))
  const paragraphs = [...text.matchAll(/\n[\t ]*\n/g)]
  let from = 0
  let to = text.length
  for (const match of paragraphs) {
    if (match.index + match[0].length <= position) from = match.index + match[0].length
    else if (match.index < position) return { from: match.index, to: match.index + match[0].length }
    else if (match.index >= position) {
      to = match.index
      break
    }
  }
  if (mode === 'paragraph') return { from, to }
  const paragraph = text.slice(from, to)
  const segments = new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(paragraph)
  for (const segment of segments) {
    const end = from + segment.index + segment.segment.length
    if (position < end || end === to) return { from: from + segment.index, to: end }
  }
  return { from, to }
}
