#!/usr/bin/env -S node --experimental-strip-types
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import {
  features,
  isVerified,
  normalizeBasePath,
  parseCommand,
  readCounts,
  type Browser,
  type Command,
} from './writer-options.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const help = `Usage: pnpm writer <command>
  list [--json]
  doctor [--browser chromium|firefox] [--json]
  verify <feature|all> [--browser chromium|firefox] [--headed] [--port 1024-65535] [--json]
Features: ${Object.keys(features).join(', ')}
Each verify builds and starts its own app, retains evidence in verification-artifacts/, and cleans up its processes.
Use pnpm --silent writer ... --json for machine-readable stdout.`

async function doctor(browser: Browser) {
  const checks: { name: string; ok: boolean; detail: string }[] = []
  const check = async (name: string, run: () => Promise<string>) => {
    try {
      checks.push({ name, ok: true, detail: await run() })
    } catch (error) {
      checks.push({ name, ok: false, detail: String(error) })
    }
  }
  await check('node', async () => {
    const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
    if (!((major === 22 && minor >= 13) || major >= 24)) throw new Error('Use Node 22.13+ or 24+')
    return process.version
  })
  await check('pnpm', async () =>
    execFileSync('pnpm', ['--version'], { cwd: root, encoding: 'utf8' }).trim(),
  )
  await check('browser', async () => {
    const playwright = await import('@playwright/test')
    const executable = playwright[browser].executablePath()
    await access(executable)
    return `${browser}: ${executable}`
  })
  await check('basePath', async () => normalizeBasePath(process.env['VITE_BASE_PATH']))
  return { status: checks.every((check) => check.ok) ? 'ready' : 'failed', checks }
}

async function availablePort(requested?: number): Promise<number> {
  const server = createServer()
  return new Promise((resolvePort, reject) => {
    server.once('error', reject)
    server.listen(requested ?? 0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('No loopback port available'))
        return
      }
      server.close((error) => (error ? reject(error) : resolvePort(address.port)))
    })
  })
}

async function verify(command: Extract<Command, { kind: 'verify' }>) {
  const parent = join(root, 'verification-artifacts')
  await mkdir(parent, { recursive: true })
  const runDirectory = await mkdtemp(join(parent, 'run-'))
  const logPath = join(runDirectory, 'commands.log')
  const summaryPath = join(runDirectory, 'summary.json')
  const basePath = normalizeBasePath(process.env['VITE_BASE_PATH'])
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  const dirty =
    execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length >
    0
  const startedAt = new Date().toISOString()
  let interrupted: NodeJS.Signals | undefined
  const children = new Set<ChildProcess>()
  let escalation: ReturnType<typeof setTimeout> | undefined
  let preview: ReturnType<typeof startCommand> | undefined
  let logWrites = Promise.resolve()
  const signalChild = (child: ChildProcess, signal: NodeJS.Signals) => {
    if (child.pid === undefined) return
    try {
      process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error
    }
  }
  const interrupt = (signal: NodeJS.Signals) => {
    interrupted = signal
    for (const child of children) signalChild(child, 'SIGINT')
    escalation ??= setTimeout(() => {
      for (const child of children) signalChild(child, 'SIGKILL')
    }, 5000)
  }
  const onInt = () => interrupt('SIGINT')
  const onTerm = () => interrupt('SIGTERM')
  process.on('SIGINT', onInt)
  process.on('SIGTERM', onTerm)
  let port: number | undefined
  let counts: ReturnType<typeof readCounts> | undefined
  let failure: string | undefined
  let status: 'passed' | 'failed' | 'interrupted' = 'failed'
  function startCommand(args: string[], env: NodeJS.ProcessEnv) {
    if (interrupted) throw new Error(`Interrupted by ${interrupted}`)
    logWrites = logWrites.then(() =>
      writeFile(logPath, `$ pnpm ${args.join(' ')}\n`, { flag: 'a' }),
    )
    const child = spawn('pnpm', args, {
      cwd: root,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.add(child)
    let output = ''
    const record = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-16000)
      process.stderr.write(chunk)
      logWrites = logWrites.then(() => writeFile(logPath, chunk, { flag: 'a' }))
    }
    child.stdout.on('data', record)
    child.stderr.on('data', record)
    const exited = new Promise<number | null>((resolveExit) => {
      child.once('error', (error) => {
        record(Buffer.from(String(error)))
        resolveExit(1)
      })
      child.once('close', (code) => {
        children.delete(child)
        resolveExit(code)
      })
    })
    return { child, exited, output: () => stripVTControlCharacters(output) }
  }
  const run = async (args: string[], env: NodeJS.ProcessEnv) => {
    const commandProcess = startCommand(args, env)
    const code = await commandProcess.exited
    if (code !== 0 || interrupted)
      throw new Error(`pnpm ${args.join(' ')} failed (${interrupted ?? code})`)
  }
  try {
    const prerequisites = await doctor(command.browser)
    await writeFile(join(runDirectory, 'doctor.json'), JSON.stringify(prerequisites, null, 2))
    if (prerequisites.status !== 'ready')
      throw new Error('Prerequisite check failed. See doctor.json.')
    port = await availablePort(command.port)
    const env = {
      ...process.env,
      VITE_BASE_PATH: basePath,
      WRITER_RUN_DIR: runDirectory,
      WRITER_PORT: String(port),
    }
    await writeFile(
      summaryPath,
      JSON.stringify(
        {
          status: 'running',
          startedAt,
          runDirectory,
          feature: command.feature,
          browser: command.browser,
          basePath,
          port,
        },
        null,
        2,
      ),
    )
    await run(['exec', 'vue-tsc', '--noEmit'], env)
    await run(['exec', 'vite', 'build', '--outDir', join(runDirectory, 'build')], env)
    await run(['exec', 'bddgen'], env)
    if (interrupted) throw new Error(`Interrupted by ${interrupted}`)
    preview = startCommand(
      [
        'exec',
        'vite',
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
        '--outDir',
        join(runDirectory, 'build'),
      ],
      env,
    )
    const url = `http://127.0.0.1:${port}${basePath}`
    const deadline = Date.now() + 30000
    while (!preview.output().includes(url)) {
      if (
        interrupted ||
        preview.child.exitCode !== null ||
        preview.child.signalCode !== null ||
        Date.now() >= deadline
      ) {
        throw new Error('Owned preview failed to start')
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 50))
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok || !(await response.text()).includes('<div id="app">'))
      throw new Error('Owned preview did not serve the writer entrypoint')
    const args = [
      'exec',
      'playwright',
      'test',
      '--project',
      command.browser,
      '--retries',
      '0',
      '--workers',
      '1',
    ]
    if (command.feature !== 'all') args.push('--grep', `@${command.feature}(?:\\s|$)`)
    if (command.headed) args.push('--headed')
    try {
      await run(args, env)
    } finally {
      try {
        counts = readCounts(JSON.parse(await readFile(join(runDirectory, 'report.json'), 'utf8')))
      } catch (error) {
        failure = String(error)
      }
    }
    if (!counts || !isVerified(counts))
      throw new Error(
        'Verification requires at least one pass and no failed, skipped, or flaky scenarios',
      )
    status = 'passed'
  } catch (error) {
    failure = `${String(error)}${failure ? `; ${failure}` : ''}`
  } finally {
    if (preview) {
      signalChild(preview.child, 'SIGTERM')
      const force = setTimeout(() => signalChild(preview!.child, 'SIGKILL'), 5000)
      await preview.exited
      clearTimeout(force)
    }
    for (const child of children) signalChild(child, 'SIGKILL')
    if (escalation) clearTimeout(escalation)
    process.off('SIGINT', onInt)
    process.off('SIGTERM', onTerm)
    await logWrites
    await rm(join(runDirectory, 'build'), { recursive: true, force: true })
    await rm(join(runDirectory, 'generated'), { recursive: true, force: true })
  }
  if (interrupted) status = 'interrupted'
  const artifacts = (await readdir(runDirectory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
  const result = {
    status,
    revision,
    dirty,
    exitCode: status === 'passed' ? 0 : interrupted === 'SIGINT' ? 130 : interrupted ? 143 : 1,
    feature: command.feature,
    browser: command.browser,
    basePath,
    port,
    startedAt,
    finishedAt: new Date().toISOString(),
    runDirectory,
    summaryPath,
    counts,
    error: failure,
    artifacts,
  }
  await writeFile(summaryPath, `${JSON.stringify(result, null, 2)}\n`)
  return result
}

try {
  const command = parseCommand(process.argv.slice(2))
  if (command.kind === 'help') console.log(command.json ? JSON.stringify({ help }) : help)
  else if (command.kind === 'list')
    console.log(
      command.json
        ? JSON.stringify(features)
        : Object.entries(features)
            .map(([name, description]) => `${name}: ${description}`)
            .join('\n'),
    )
  else if (command.kind === 'doctor') {
    const result = await doctor(command.browser)
    console.log(
      command.json
        ? JSON.stringify(result)
        : result.checks
            .map((check) => `${check.ok ? 'OK' : 'FAIL'} ${check.name}: ${check.detail}`)
            .join('\n'),
    )
    process.exitCode = result.status === 'ready' ? 0 : 1
  } else {
    const result = await verify(command)
    console.log(
      command.json
        ? JSON.stringify(result)
        : `${result.status}: ${result.feature} (${result.browser})\nEvidence: ${result.summaryPath}${result.error ? `\n${result.error}` : ''}`,
    )
    process.exitCode = result.exitCode
  }
} catch (error) {
  const result = { status: 'failed', exitCode: 2, error: String(error) }
  console.log(process.argv.includes('--json') ? JSON.stringify(result) : result.error)
  process.exitCode = 2
}
