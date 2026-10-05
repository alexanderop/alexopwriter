import ts from 'typescript'
import path from 'node:path'

export type ArchitectureIssue = { file: string; line: number; message: string }
const ambientEffects = new Set([
  'window',
  'document',
  'navigator',
  'globalThis',
  'self',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'crypto',
  'Date',
  'File',
  'FileReader',
  'Blob',
  'Worker',
  'MessageEvent',
  'ErrorEvent',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'BroadcastChannel',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'performance',
  'process',
  'require',
  'eval',
  'Function',
])
function relative(root: string, file: string) {
  return path.relative(path.join(root, 'src'), file).split(path.sep).join('/')
}
function feature(file: string) {
  const [area, name] = file.split('/')
  return area === 'features' && name ? `features/${name}` : null
}
function core(file: string) {
  return (
    /^features\/[^/]+\/(domain|application)\//.test(file) || file.startsWith('app/application/')
  )
}
function modulePath(
  specifier: string,
  importer: string,
  root: string,
  options: ts.CompilerOptions,
): string | null {
  const clean = specifier.split('?')[0] ?? specifier
  if (clean.startsWith('.')) return path.resolve(path.dirname(importer), clean)
  if (clean.startsWith('@/') || clean.startsWith('~/'))
    return path.resolve(root, 'src', clean.slice(2))
  if (clean.startsWith('/src/')) return path.resolve(root, clean.slice(1))
  for (const [alias, destinations] of Object.entries(options.paths ?? {})) {
    const [prefix = '', suffix = ''] = alias.split('*')
    if (
      alias.includes('*') ? clean.startsWith(prefix) && clean.endsWith(suffix) : clean === alias
    ) {
      const target = destinations[0]
      if (target)
        return path.resolve(
          options.baseUrl ?? root,
          target.replace('*', clean.slice(prefix.length, suffix ? -suffix.length : undefined)),
        )
    }
  }
  const resolved = ts.resolveModuleName(clean, importer, options, ts.sys).resolvedModule
  if (resolved && !resolved.isExternalLibraryImport) return path.resolve(resolved.resolvedFileName)
  return null
}
function within(file: string, directory: string) {
  return file === directory || file.startsWith(`${directory}/`)
}
export function inspectArchitecture(
  source: string,
  file: string,
  root: string,
  options: ts.CompilerOptions = {},
): ArchitectureIssue[] {
  const origin = relative(root, file)
  const owner = feature(origin)
  const pure = core(origin)
  const issues: ArchitectureIssue[] = []
  const blocks = file.endsWith('.vue')
    ? [...source.matchAll(/<script\b([^>]*?)(?:\/>|>([\s\S]*?)<\/script>)/g)].map((match) => ({
        text: match[2] ?? '',
        offset:
          source.slice(0, (match.index ?? 0) + match[0].indexOf('>') + 1).split('\n').length - 1,
        src: /\bsrc\s*=\s*['"]([^'"]+)['"]/.exec(match[1] ?? '')?.[1],
      }))
    : [{ text: source, offset: 0, src: undefined }]
  function dependency(specifier: string, line: number) {
    const target = modulePath(specifier, file, root, options)
    const report = (message: string) => issues.push({ file: origin, line, message })
    if (!target) {
      if (
        /^(?:(?:reka-ui|radix-vue)(?:$|\/)|@radix-ui\/)/.test(specifier) &&
        !origin.startsWith('shared/ui/')
      )
        report(`UI primitives belong in shared/ui: ${specifier}`)
      const markdownParser =
        origin === 'features/reading/domain/markdown.ts' &&
        (specifier === 'markdown-it' || specifier.startsWith('markdown-it/'))
      if (pure && !markdownParser)
        report(`Core modules cannot import external dependencies: ${specifier}`)
      return
    }
    const destination = relative(root, target)
      .replace(/\.(ts|vue|js|mjs)$/, '')
      .replace(/\/index$/, '')
    const targetOwner = feature(destination)
    if (within(destination, 'shared/ui')) {
      const unit = destination.split('/')[2]
      const ownUnit = origin.startsWith(`shared/ui/${unit}/`)
      if (!ownUnit && destination !== `shared/ui/${unit}`)
        report(`Use the shared UI public API: ${specifier}`)
    }
    if (origin.startsWith('shared/storage/') && within(destination, 'shared/ui'))
      report(`Storage cannot depend on UI: ${specifier}`)
    if (origin.startsWith('shared/ui/') && within(destination, 'shared/storage'))
      report(`UI components cannot own persistence: ${specifier}`)
    if (destination.startsWith('../')) {
      report(`Source modules cannot import outside src: ${specifier}`)
      return
    }
    if (
      owner &&
      ((targetOwner && targetOwner !== owner) ||
        within(destination, 'app') ||
        destination === 'App' ||
        destination === 'main')
    ) {
      report(`Features cannot import another feature or app: ${specifier}`)
    }
    if (
      origin.startsWith('shared/') &&
      (targetOwner || within(destination, 'app') || destination === 'App' || destination === 'main')
    ) {
      report(`Shared cannot depend on features or app: ${specifier}`)
    }
    if (targetOwner && targetOwner !== owner) {
      const publicEntry = destination === targetOwner || destination === `${targetOwner}/ui`
      const compositionAdapter =
        origin === 'app/bootstrap.ts' && destination.startsWith(`${targetOwner}/adapters/`)
      if (!publicEntry && !compositionAdapter) report(`Use the feature public API: ${specifier}`)
    }
    if (
      owner &&
      origin === `${owner}/index.ts` &&
      !new RegExp(`^${owner}/(domain|application)/`).test(destination) &&
      !(owner === 'features/editor' && destination === 'features/editor/ports')
    ) {
      report(`Public core API cannot export infrastructure or UI: ${specifier}`)
    }
    if (pure) {
      if (within(destination, 'shared') || /\/(adapters|ui)(\/|$)/.test(destination))
        report(`Core modules cannot import infrastructure or UI: ${specifier}`)
      if (
        owner &&
        origin.includes('/application/') &&
        !new RegExp(`^${owner}/(application|domain)/`).test(destination)
      )
        report(`Feature workflows only depend on their own application and domain: ${specifier}`)
      if (origin.includes('/domain/') && !destination.startsWith(`${owner}/domain/`))
        report(`Domain modules only depend on their own domain: ${specifier}`)
      if (
        origin.startsWith('app/application/') &&
        !targetOwner &&
        !destination.startsWith('app/application/')
      )
        report(`App workflows cannot import composition or presentation: ${specifier}`)
    }
  }
  if (
    !/^(app|features|shared)\//.test(origin) &&
    !['main.ts', 'App.vue', 'pwa.d.ts'].includes(origin)
  ) {
    issues.push({
      file: origin,
      line: 1,
      message: 'Source modules belong in app, features/<name>, or shared',
    })
  }
  for (const block of blocks) {
    if (block.src) dependency(block.src, block.offset + 1)
    const parsed = ts.createSourceFile(
      file + '.ts',
      block.text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const host = ts.createCompilerHost({ noLib: true, noResolve: true })
    host.getSourceFile = (name) => (name === parsed.fileName ? parsed : undefined)
    const checker = ts
      .createProgram([parsed.fileName], { noLib: true, noResolve: true }, host)
      .getTypeChecker()
    function report(node: ts.Node, message: string) {
      issues.push({
        file: origin,
        line: block.offset + parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
        message,
      })
    }
    function module(node: ts.Node | undefined) {
      if (node && ts.isStringLiteralLike(node))
        dependency(
          node.text,
          block.offset + parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
        )
      else if (node && ts.isIdentifier(node)) {
        const declaration = checker.getSymbolAtLocation(node)?.declarations?.find(ts.isImportClause)
        const specifier = declaration?.parent.moduleSpecifier
        if (specifier && ts.isStringLiteralLike(specifier) && specifier.text.endsWith('?url'))
          module(specifier)
        else report(node, 'Module paths must be static string literals or imported URL assets')
      } else if (node) report(node, 'Module paths must be static string literals')
    }
    function visit(node: ts.Node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
        module(node.moduleSpecifier)
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
        module(node.argument.literal)
      if (ts.isExternalModuleReference(node)) module(node.expression)
      if (ts.isCallExpression(node)) {
        const expression =
          ts.isElementAccessExpression(node.expression) &&
          ts.isStringLiteralLike(node.expression.argumentExpression)
            ? `${node.expression.expression.getText(parsed)}.${node.expression.argumentExpression.text}`
            : node.expression.getText(parsed)
        if (
          node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          expression === 'require' ||
          expression === 'import.meta.resolve'
        )
          module(node.arguments[0])
        if (expression.startsWith('import.meta.glob'))
          report(node, 'Glob imports bypass feature contracts and are not allowed')
        if (pure && node.expression.kind === ts.SyntaxKind.ImportKeyword)
          report(node, 'Core modules use static imports')
      }
      if (
        ts.isNewExpression(node) &&
        node.expression.getText(parsed) === 'URL' &&
        node.arguments?.[1]?.getText(parsed) === 'import.meta.url'
      )
        module(node.arguments[0])
      if (pure && ts.isMetaProperty(node)) report(node, 'Core modules cannot access import.meta')
      if (pure && ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node)
        const local = symbol?.declarations?.some(
          (declaration) => declaration.getSourceFile() === parsed,
        )
        const propertyName =
          (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
          ((ts.isPropertyAssignment(node.parent) || ts.isPropertySignature(node.parent)) &&
            node.parent.name === node)
        if (!local && !propertyName && ambientEffects.has(node.text))
          report(node, `Inject the ${node.text} capability at the application boundary`)
        if (!local && node.text === 'Math') {
          const allowedMath =
            ts.isPropertyAccessExpression(node.parent) && node.parent.name.text !== 'random'
          if (!allowedMath) report(node, 'Randomness must be injected')
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(parsed)
  }
  return issues
}
