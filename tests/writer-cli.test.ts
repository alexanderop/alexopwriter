import { readFile, readdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  features,
  isVerified,
  normalizeBasePath,
  parseCommand,
  readCounts,
} from '../scripts/writer-options'

describe('writer commands', () => {
  it('selects a feature, browser, and isolated explicit port', () => {
    expect(
      parseCommand(['verify', 'images', '--browser', 'firefox', '--port', '5310', '--json']),
    ).toEqual({
      kind: 'verify',
      feature: 'images',
      browser: 'firefox',
      port: 5310,
      json: true,
      headed: false,
    })
    expect(parseCommand(['verify'])).toEqual({
      kind: 'verify',
      feature: 'all',
      browser: 'chromium',
      json: false,
      headed: false,
    })
  })
  it.each([
    ['verify', 'imagse'],
    ['verify', 'toString'],
    ['verify', 'all', 'extra'],
    ['verify', '--browser', 'safari'],
    ['verify', '--port', 'NaN'],
    ['verify', '--port', '0'],
    ['verify', '--port', '65536'],
    ['doctor', '--headed'],
    ['list', '--browser', 'chromium'],
    ['verify', '--skip-checks'],
  ])('rejects invalid input %j', (...args) => {
    expect(() => parseCommand(args)).toThrow()
  })
  it('accepts local and Pages base paths but rejects URLs and path traversal', () => {
    expect(normalizeBasePath()).toBe('/')
    expect(normalizeBasePath('/alexopwriter/')).toBe('/alexopwriter/')
    for (const value of ['https://example.test/', '../', '/app/../', '/app', '//', '/a b/']) {
      expect(() => normalizeBasePath(value)).toThrow()
    }
  })
})

describe('verification outcomes', () => {
  it('requires nonzero successful scenarios with no skipped or flaky outcomes', () => {
    expect(
      isVerified(readCounts({ stats: { expected: 3, unexpected: 0, skipped: 0, flaky: 0 } })),
    ).toBe(true)
    for (const stats of [
      { expected: 0, unexpected: 0, skipped: 0, flaky: 0 },
      { expected: 3, unexpected: 1, skipped: 0, flaky: 0 },
      { expected: 3, unexpected: 0, skipped: 1, flaky: 0 },
      { expected: 3, unexpected: 0, skipped: 0, flaky: 1 },
    ])
      expect(isVerified(readCounts({ stats }))).toBe(false)
  })
  it.each([null, {}, { stats: {} }, { stats: { expected: '3' } }, { stats: { expected: -1 } }])(
    'rejects incomplete or invalid reports',
    (report) => {
      expect(() => readCounts(report)).toThrow()
    },
  )
  it('keeps every BDD feature discoverable through a supported CLI selection', async () => {
    const selected = new Set<string>()
    for (const file of await readdir('tests/e2e')) {
      if (!file.endsWith('.feature')) continue
      let inherited: string[] = []
      let pending: string[] = []
      for (const line of (await readFile(`tests/e2e/${file}`, 'utf8')).split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('@')) pending.push(...trimmed.split(/\s+/u))
        else if (trimmed.startsWith('Feature:')) {
          inherited = pending
          pending = []
        } else if (trimmed.startsWith('Scenario:')) {
          const tags = [...inherited, ...pending].filter((tag) =>
            Object.hasOwn(features, tag.slice(1)),
          )
          expect(tags.length, `${file}: ${trimmed}`).toBeGreaterThan(0)
          tags.forEach((tag) => selected.add(tag.slice(1)))
          pending = []
        }
      }
    }
    expect([...selected].sort()).toEqual(Object.keys(features).sort())
  })
})
