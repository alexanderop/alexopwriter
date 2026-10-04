import { parseArgs } from 'node:util'

export const features = {
  recovery: 'Drafts, document names, and conflicting tabs survive recovery',
  'import-export': 'Markdown files retain their names and exact bytes',
  offline: 'Writing and recovery work without a network connection',
  images: 'Pasted images and manual alt text survive recovery and export',
  editing: 'Keyboard edits, history, preferences, and optional help work',
} as const

export type Feature = keyof typeof features
export type Browser = 'chromium' | 'firefox'
export type Command =
  | { kind: 'help'; json: boolean }
  | { kind: 'list'; json: boolean }
  | { kind: 'doctor'; json: boolean; browser: Browser }
  | {
      kind: 'verify'
      json: boolean
      browser: Browser
      feature: Feature | 'all'
      headed: boolean
      port?: number
    }

export function parseCommand(args: string[]): Command {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      headed: { type: 'boolean', default: false },
      browser: { type: 'string' },
      port: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const [kind = 'help', feature = 'all'] = positionals
  if (values.help) return { kind: 'help', json: values.json }
  if (!['help', 'list', 'doctor', 'verify'].includes(kind))
    throw new Error(`Unknown command: ${kind}`)
  if (positionals.length > (kind === 'verify' ? 2 : 1)) throw new Error('Too many arguments')
  if (kind !== 'verify' && (values.headed || values.port))
    throw new Error('--headed and --port require verify')
  if ((kind === 'help' || kind === 'list') && values.browser)
    throw new Error('--browser requires doctor or verify')
  if (kind === 'help' || kind === 'list') return { kind, json: values.json }
  const browser = values.browser ?? 'chromium'
  if (browser !== 'chromium' && browser !== 'firefox')
    throw new Error('Browser must be chromium or firefox')
  if (kind === 'doctor') return { kind, json: values.json, browser }
  if (feature !== 'all' && !Object.hasOwn(features, feature))
    throw new Error(`Unknown feature: ${feature}`)
  const port = values.port === undefined ? undefined : Number(values.port)
  if (
    port !== undefined &&
    (!/^\d+$/u.test(values.port!) || !Number.isInteger(port) || port < 1024 || port > 65535)
  ) {
    throw new Error('Port must be an integer between 1024 and 65535')
  }
  return {
    kind: 'verify',
    feature: feature as Feature | 'all',
    browser,
    json: values.json,
    headed: values.headed,
    ...(port === undefined ? {} : { port }),
  }
}

export function normalizeBasePath(value = '/'): string {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/u.test(value))
    throw new Error('VITE_BASE_PATH must be / or a slash-delimited path such as /alexopwriter/')
  return value
}

export function readCounts(report: unknown) {
  if (!report || typeof report !== 'object' || !('stats' in report))
    throw new Error('Playwright report has no stats')
  const stats = report.stats
  if (!stats || typeof stats !== 'object') throw new Error('Invalid Playwright stats')
  const count = (name: string): number => {
    if (!(name in stats)) throw new Error(`Missing Playwright count: ${name}`)
    const value: unknown = Reflect.get(stats, name)
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
      throw new Error(`Invalid Playwright count: ${name}`)
    return value
  }
  return {
    passed: count('expected'),
    failed: count('unexpected'),
    skipped: count('skipped'),
    flaky: count('flaky'),
  }
}

export function isVerified(counts: ReturnType<typeof readCounts>): boolean {
  return counts.passed > 0 && counts.failed === 0 && counts.skipped === 0 && counts.flaky === 0
}
