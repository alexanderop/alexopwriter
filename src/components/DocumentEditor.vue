<script setup lang="ts">
import { onMounted, onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  keymap,
  placeholder,
  drawSelection,
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  isolateHistory,
} from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { Vim, getCM, vim } from '@replit/codemirror-vim'
import { markdownHighlight } from '../editor/markdown.ts'

export type SelectionTarget = Readonly<{
  from: number
  to: number
  text: string
  revision: number
  documentId: string
}>
const props = defineProps<{
  documentId: string
  text: string
  revision: number
  vimEnabled: boolean
}>()
const emit = defineEmits<{
  change: [id: string, text: string]
  mode: [mode: string]
  selection: [available: boolean]
}>()
const host = useTemplateRef<HTMLDivElement>('host')
const vimConfig = new Compartment()
const states = new Map<string, EditorState>()
let view: EditorView | null = null
let currentId = props.documentId
let revision = props.revision
Vim.map('jj', '<Esc>', 'insert')
function reportMode() {
  if (!view || !props.vimEnabled) {
    emit('mode', 'TEXT')
    return
  }
  const state = getCM(view)?.state.vim
  if (state?.insertMode) emit('mode', 'INSERT')
  else if (state?.visualMode) emit('mode', 'VISUAL')
  else emit('mode', 'NORMAL')
}
function makeState(text: string) {
  return EditorState.create({
    doc: text,
    extensions: [
      history(),
      drawSelection(),
      markdown(),
      syntaxHighlighting(markdownHighlight),
      EditorView.lineWrapping,
      placeholder('Start writing. This space is yours.'),
      vimConfig.of(props.vimEnabled ? vim() : []),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.contentAttributes.of({
        'aria-label': 'Document editor',
        spellcheck: 'false',
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          revision += 1
          emit('change', currentId, update.state.doc.toString())
        }
        emit('selection', !update.state.selection.main.empty)
        queueMicrotask(reportMode)
      }),
      EditorView.domEventHandlers({
        keyup: () => {
          queueMicrotask(reportMode)
        },
      }),
    ],
  })
}
onMounted(() => {
  if (!host.value) return
  view = new EditorView({ state: makeState(props.text), parent: host.value })
  reportMode()
})
watch(
  () => props.documentId,
  (id) => {
    if (!view) return
    states.set(currentId, view.state)
    currentId = id
    revision = props.revision
    view.setState(states.get(id) ?? makeState(props.text))
    view.dispatch({
      effects: vimConfig.reconfigure(props.vimEnabled ? vim() : []),
    })
    reportMode()
    emit('selection', !view.state.selection.main.empty)
  },
)
watch(
  () => props.revision,
  (next) => {
    revision = Math.max(revision, next)
  },
)
watch(
  () => props.vimEnabled,
  (enabled) => {
    view?.dispatch({ effects: vimConfig.reconfigure(enabled ? vim() : []) })
    reportMode()
  },
)
onBeforeUnmount(() => {
  view?.destroy()
  states.clear()
})
function captureSelection(): SelectionTarget | null {
  if (!view) return null
  const { from, to, empty } = view.state.selection.main
  if (empty) return null
  return {
    from,
    to,
    text: view.state.doc.sliceString(from, to),
    revision,
    documentId: currentId,
  }
}
function applyReplacement(
  target: SelectionTarget,
  replacement: string,
): boolean {
  if (
    !view ||
    target.documentId !== currentId ||
    target.revision !== revision ||
    view.state.doc.sliceString(target.from, target.to) !== target.text
  )
    return false
  view.dispatch({
    changes: { from: target.from, to: target.to, insert: replacement },
    selection: { anchor: target.from + replacement.length },
    annotations: isolateHistory.of('full'),
  })
  view.focus()
  return true
}
function selectRange(from: number, to: number): SelectionTarget | null {
  if (!view || from < 0 || to > view.state.doc.length) return null
  view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true })
  view.focus()
  return captureSelection()
}
defineExpose({
  captureSelection,
  applyReplacement,
  selectRange,
  focus: () => view?.focus(),
})
</script>

<template><div ref="host" class="document-editor" /></template>
