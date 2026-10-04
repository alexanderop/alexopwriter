import { expect, it } from 'vitest'
import { createSuggestionSession } from '../src/app/application/suggestionSession'
import type { SelectionTarget } from '../src/editor'
import { testWorkspace } from './support/workspace'
import { controlledAssistant } from './support/controlledAssistant'

async function fixture() {
  const workspace = testWorkspace()
  await workspace.create('draft.md', 'Original passage')
  const control = controlledAssistant()
  let selected = true
  const session = createSuggestionSession({
    workspace, assistant: control.assistant, canSuggest: text => !text.includes('![image]'),
    editor: {
      captureSelection() {
        const doc = workspace.snapshot().documents.find(doc => doc.id === workspace.snapshot().activeId)
        return selected && doc ? { documentId: doc.id, revision: doc.revision, text: doc.text, from: 0, to: doc.text.length } : null
      },
      applyReplacement(target: SelectionTarget, text: string) {
        const doc = workspace.snapshot().documents.find(doc => doc.id === workspace.snapshot().activeId)
        if (!doc || doc.id !== target.documentId || doc.revision !== target.revision || doc.text !== target.text) return false
        workspace.edited(doc.id, text)
        return true
      },
    },
  })
  return { workspace, control, session, deselect: () => { selected = false }, async dispose() { session.dispose(); control.assistant.dispose(); await workspace.dispose() } }
}
it('accepts a valid proposal even after the selection moves', async () => {
  const f = await fixture()
  try {
    const pending = f.session.suggest('clarify')
    f.deselect()
    f.control.requests[0]?.resolve('Clear passage')
    await pending
    expect(f.session.snapshot().proposal?.text).toBe('Clear passage')
    f.session.accept()
    expect(f.workspace.snapshot().documents[0]?.text).toBe('Clear passage')
    expect(f.session.snapshot()).toEqual({ proposal: null, notice: { kind: 'applied' } })
  } finally { await f.dispose() }
})
it('rejects empty and image selections before contacting the assistant', async () => {
  const f = await fixture()
  try {
    f.workspace.edited('document-1', '![image](data:image/png;base64,abc)')
    await f.session.suggest('clarify')
    expect(f.session.snapshot().notice.kind).toBe('images')
    f.deselect()
    await f.session.suggest('clarify')
    expect(f.session.snapshot().notice.kind).toBe('select')
    expect(f.control.requests).toHaveLength(0)
  } finally { await f.dispose() }
})
it('invalidates a late result synchronously when the document switches away and back', async () => {
  const f = await fixture()
  try {
    const pending = f.session.suggest('clarify')
    await f.workspace.create('other.md', 'Other document')
    f.workspace.activate('document-1')
    f.control.requests[0]?.resolve('Stale passage')
    await pending
    expect(f.session.snapshot().proposal).toBeNull()
    expect(f.control.cancellations()).toBe(1)
    expect(f.workspace.snapshot().documents[0]?.text).toBe('Original passage')
  } finally { await f.dispose() }
})
it('rejects inference after a revision changes and refuses stale acceptance', async () => {
  const f = await fixture()
  try {
    const pending = f.session.suggest('clarify')
    f.workspace.rename('document-1', 'renamed.md')
    f.control.requests[0]?.resolve('Stale passage')
    await pending
    expect(f.session.snapshot()).toEqual({ proposal: null, notice: { kind: 'changed' } })
    const retry = f.session.suggest('clarify')
    f.control.requests[1]?.resolve('Proposal')
    await retry
    f.workspace.edited('document-1', 'Newer writing')
    f.session.accept()
    expect(f.workspace.snapshot().documents[0]?.text).toBe('Newer writing')
    expect(f.session.snapshot().notice.kind).toBe('stale')
  } finally { await f.dispose() }
})
it.each(['resolve', 'reject'] as const)('ignores an older %s after a newer request completes', async outcome => {
  const f = await fixture()
  try {
    const older = f.session.suggest('clarify')
    const newer = f.session.suggest('shorten')
    f.control.requests[1]?.resolve('Newest proposal')
    await newer
    if (outcome === 'resolve') f.control.requests[0]?.resolve('Old proposal')
    else f.control.requests[0]?.reject(new Error('Old failure'))
    await older
    expect(f.session.snapshot()).toMatchObject({ proposal: { text: 'Newest proposal' }, notice: { kind: 'none' } })
  } finally { await f.dispose() }
})
it.each(['cancel', 'discard', 'dispose'] as const)('%s prevents a late result from restoring the proposal', async action => {
  const f = await fixture()
  try {
    const pending = f.session.suggest('clarify')
    f.session[action]()
    f.control.requests[0]?.resolve('Late proposal')
    await pending
    expect(f.session.snapshot().proposal).toBeNull()
  } finally { await f.dispose() }
})
