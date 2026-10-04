import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { inspectArchitecture } from './architecture.ts'

const root = process.cwd()
const configFile = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root)
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? files(file) : /\.(ts|vue|js|mjs)$/.test(file) ? [file] : []
  })
}
const sources = files(path.join(root, 'src'))
const issues = sources.flatMap(file => inspectArchitecture(readFileSync(file, 'utf8'), file, root, config.options))
for (const issue of issues) console.error(`${issue.file}:${issue.line} ${issue.message}`)
if (issues.length) process.exitCode = 1
else console.log(`Architecture boundaries passed for ${sources.length} source files.`)
