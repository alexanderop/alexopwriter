import path from 'node:path'
import ts from 'typescript'
import { inspectArchitecture } from './architecture.ts'

const configs = new Map()
function compilerOptions(root) {
  if (!configs.has(root)) {
    const file = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
    configs.set(
      root,
      file.error ? {} : ts.parseJsonConfigFileContent(file.config, ts.sys, root).options,
    )
  }
  return configs.get(root)
}

export default {
  meta: { name: 'writer-architecture' },
  rules: {
    boundaries: {
      meta: { type: 'problem', schema: [], messages: { boundary: '{{message}}' } },
      create(context) {
        const file = context.filename
        const root = context.cwd
        if (!path.relative(root, file).startsWith(`src${path.sep}`)) return {}
        return {
          Program() {
            for (const issue of inspectArchitecture(
              context.sourceCode.text,
              file,
              root,
              compilerOptions(root),
            )) {
              context.report({
                loc: { line: issue.line, column: 0 },
                messageId: 'boundary',
                data: { message: issue.message },
              })
            }
          },
        }
      },
    },
  },
}
