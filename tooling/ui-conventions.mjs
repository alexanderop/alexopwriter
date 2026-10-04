const controls = new Map([
  ['button', 'BaseButton'], ['input', 'BaseInput'], ['textarea', 'BaseTextarea'],
  ['select', 'a shared select component'], ['dialog', 'a shared dialog component'],
])

export default {
  meta: { name: 'writer-ui' },
  rules: {
    'shared-controls': {
      meta: { type: 'problem', schema: [], messages: { control: 'Use {{component}} from shared/ui.', style: 'Use design tokens and shared component variants instead of literal colors or control style overrides.' } },
      create(context) {
        if (context.filename.replaceAll('\\', '/').includes('/src/shared/ui/')) return {}
        return context.sourceCode.parserServices.defineTemplateBodyVisitor({
          VElement(node) {
            const component = controls.get(node.rawName)
            const hiddenFile = node.rawName === 'input' && node.startTag.attributes.some(a => !a.directive && a.key.name === 'type' && a.value?.value === 'file') && node.startTag.attributes.some(a => !a.directive && a.key.name === 'hidden')
            if (component && !hiddenFile) context.report({ node: node.startTag, messageId: 'control', data: { component } })
          },
          VAttribute(node) {
            const key = node.directive ? node.key.argument?.name : node.key.name
            if (key !== 'class' && key !== 'style') return
            const source = context.sourceCode.getText(node)
            const onControl = /^Base(Button|Input|Textarea)$/.test(node.parent.parent.rawName)
            const literalColor = /#[\da-f]{3,8}\b|(?:rgb|hsl|oklch)\(|(?:bg|text|border|ring)-(?:red|blue|gray|slate|zinc|neutral|stone|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-\d/.test(source)
            const override = onControl && (key === 'style' || /(?:^|[\s:'"`])(?:[\w-]+:)*(?:bg-|text-(?:xs|sm|base|lg|xl|\[)|rounded|border-|ring-|outline-|font-|p[xytrblse]?-|h-|min-h-)/.test(source))
            if (literalColor || override) context.report({ node, messageId: 'style' })
          },
        })
      },
    },
  },
}
