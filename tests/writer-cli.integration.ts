import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, access } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'

async function invoke(args: string[], interruptWhen?: string) {
  const child = spawn(process.execPath, ['--experimental-strip-types', 'scripts/writer-cli.ts', ...args, '--json'], {
    env: { ...process.env, VITE_BASE_PATH: '/alexopwriter/' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let interrupted = false
  child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
  child.stderr.on('data', (data: Buffer) => {
    stderr += data.toString()
    if (interruptWhen && !interrupted && stderr.includes(interruptWhen)) {
      interrupted = true
      child.kill('SIGTERM')
    }
  })
  const watchdog = setTimeout(() => child.kill('SIGTERM'), 90000)
  try {
    const code = await new Promise<number | null>((resolveExit, reject) => {
      child.once('error', reject)
      child.once('close', resolveExit)
    })
    assert.ok(stdout.trim(), `CLI did not report an outcome. ${stderr}`)
    const summary = JSON.parse(stdout)
    return { code, summary, stderr, interrupted }
  } finally { clearTimeout(watchdog) }
}

async function expectCleaned(summary: { port: number; runDirectory: string; summaryPath: string }) {
  await access(summary.summaryPath)
  await assert.rejects(access(join(summary.runDirectory, 'build')))
  await assert.rejects(access(join(summary.runDirectory, 'generated')))
  await assert.rejects(fetch(`http://127.0.0.1:${summary.port}/`, { signal: AbortSignal.timeout(1000) }))
}

test('CLI retains successful browser evidence and stops its preview', { timeout: 120000 }, async () => {
  const { code, summary, stderr } = await invoke(['verify', 'import-export'])
  assert.equal(code, 0, stderr)
  assert.equal(summary.status, 'passed')
  assert.deepEqual(summary.counts, { passed: 3, failed: 0, skipped: 0, flaky: 0 })
  assert.equal(summary.basePath, '/alexopwriter/')
  assert.ok(summary.artifacts.some((path: string) => path.endsWith('/trace.zip')))
  assert.ok(summary.artifacts.some((path: string) => path.endsWith('.png')))
  for (const path of summary.artifacts) await access(path)
  const report = await readFile(join(summary.runDirectory, 'report.json'), 'utf8')
  assert.ok(report.includes('text/markdown'), 'Downloaded bytes must remain attached to the report')
  await expectCleaned(summary)
})

test('SIGTERM stops active browser verification and preserves its interrupted outcome', { timeout: 120000 }, async () => {
  const { code, summary, interrupted } = await invoke(['verify', 'all'], ' tests using ')
  assert.ok(interrupted)
  assert.equal(code, 143)
  assert.equal(summary.status, 'interrupted')
  await expectCleaned(summary)
  await access(join(summary.runDirectory, 'commands.log'))
})

test('an occupied port fails without stopping its owner', { timeout: 15000 }, async () => {
  const server = createServer(socket => socket.end('owned by the integration test'))
  await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const { code, summary } = await invoke(['verify', 'recovery', '--port', String(address.port)])
    assert.equal(code, 1)
    assert.equal(summary.status, 'failed')
    assert.ok(server.listening)
    await access(summary.summaryPath)
  } finally { await new Promise<void>(resolveClose => server.close(() => resolveClose())) }
})
