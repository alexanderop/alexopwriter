export type WritingPreferences = Readonly<{
  font: 'mono' | 'serif' | 'sans'
  fontSize: number
  lineWidth: 'narrow' | 'medium' | 'wide'
  focus: 'off' | 'sentence' | 'paragraph'
  typewriter: boolean
  spellcheck: boolean
  language: 'auto' | 'en' | 'en-US' | 'en-GB' | 'de' | 'fr' | 'es'
}>
export const defaultWritingPreferences: WritingPreferences = {
  font: 'mono',
  fontSize: 18,
  lineWidth: 'medium',
  focus: 'paragraph',
  typewriter: false,
  spellcheck: true,
  language: 'auto',
}
function option<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return choices.find((choice) => choice === value) ?? fallback
}
export function parseWritingPreferences(value: unknown): WritingPreferences {
  if (!value || typeof value !== 'object') return { ...defaultWritingPreferences }
  const data = value as Record<string, unknown>
  return {
    font: option(data.font, ['mono', 'serif', 'sans'], 'mono'),
    fontSize:
      typeof data.fontSize === 'number' &&
      Number.isInteger(data.fontSize) &&
      data.fontSize >= 14 &&
      data.fontSize <= 28
        ? data.fontSize
        : 18,
    lineWidth: option(data.lineWidth, ['narrow', 'medium', 'wide'], 'medium'),
    focus: option(data.focus, ['off', 'sentence', 'paragraph'], 'paragraph'),
    typewriter: typeof data.typewriter === 'boolean' ? data.typewriter : false,
    spellcheck: typeof data.spellcheck === 'boolean' ? data.spellcheck : true,
    language: option(data.language, ['auto', 'en', 'en-US', 'en-GB', 'de', 'fr', 'es'], 'auto'),
  }
}
const fonts = {
  mono: '"IBM Plex Mono", monospace',
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'system-ui, sans-serif',
}
const widths = { narrow: '36rem', medium: '42rem', wide: '54rem' }
export function writingStyle(preferences: WritingPreferences) {
  return {
    '--writing-font': fonts[preferences.font],
    '--writing-size': `${preferences.fontSize}px`,
    '--writing-width': widths[preferences.lineWidth],
  }
}
