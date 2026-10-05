<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { search, searchKeymap, openSearchPanel } from '@codemirror/search'
import {
  defaultWritingPreferences,
  writingStyle,
  type WritingPreferences,
} from '../domain/preferences'
import { passageFocus, typewriterScrolling } from '../writingExtensions'
import { Vim, getCM, vim } from '@replit/codemirror-vim'
import {
  clipboardImages,
  encodeClipboardImages,
  embeddedImages,
  imageMarkdown,
  type ImageTarget,
} from '../images'
import {
  addImagePaste,
  removeImagePaste,
  pendingImagePastes,
  imageWidgets,
  imageEditAction,
  imageTargets,
  addImageTarget,
  removeImageTarget,
} from '../imageExtensions'
import { markdownHighlight } from '../markdown.ts'

import type { SelectionTarget } from '../ports'
const props = defineProps<{
  documentId: string
  text: string
  revision: number
  vimEnabled: boolean
  preferences?: WritingPreferences
  focusEnabled?: boolean
  encodeImages?: (files: readonly File[]) => Promise<string>
}>()
const emit = defineEmits<{
  image: [target: ImageTarget]
  error: [error: Error]
  change: [id: string, text: string]
  mode: [mode: string]
  selection: [available: boolean]
}>()
const host = useTemplateRef<HTMLDivElement>('host')
const vimConfig = new Compartment()
const writingConfig = new Compartment()
const preferences = computed(() => props.preferences ?? defaultWritingPreferences)
function writingExtensions() {
  const settings = preferences.value
  return [
    EditorView.contentAttributes.of({
      'aria-label': 'Document editor',
      spellcheck: String(settings.spellcheck),
      lang: settings.language === 'auto' ? navigator.language : settings.language,
    }),
    passageFocus(props.focusEnabled ? settings.focus : 'off'),
    settings.typewriter ? typewriterScrolling : [],
  ]
}
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
      pendingImagePastes,
      imageTargets,
      imageWidgets,
      imageEditAction.of((position) => {
        const target = captureImage(position)
        if (target) emit('image', target)
      }),
      syntaxHighlighting(markdownHighlight),
      EditorView.lineWrapping,
      placeholder('Start writing. This space is yours.'),
      vimConfig.of(props.vimEnabled ? vim() : []),
      search({ top: true }),
      keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap]),
      writingConfig.of(writingExtensions()),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          revision += 1
          emit('change', currentId, update.state.doc.toString())
        }
        emit('selection', !update.state.selection.main.empty)
        queueMicrotask(reportMode)
      }),
      EditorView.domEventHandlers({
        paste: (event) => pasteImages(event),
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
      effects: [
        vimConfig.reconfigure(props.vimEnabled ? vim() : []),
        writingConfig.reconfigure(writingExtensions()),
      ],
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
watch(
  [preferences, () => props.focusEnabled],
  () => {
    view?.dispatch({ effects: writingConfig.reconfigure(writingExtensions()) })
  },
  { deep: true },
)
onBeforeUnmount(() => {
  view?.destroy()
  view = null
  states.clear()
})
function pasteImages(event: ClipboardEvent): boolean {
  const files = clipboardImages(event.clipboardData)
  if (!view || !files.length) return false
  event.preventDefault()
  const documentId = currentId
  const id = Symbol('image paste')
  const { from, to } = view.state.selection.main
  view.dispatch({ effects: addImagePaste.of({ id, from, to }) })
  void (props.encodeImages ?? encodeClipboardImages)(files)
    .then((insert) => {
      if (!view) return
      const state = documentId === currentId ? view.state : states.get(documentId)
      const target = state?.field(pendingImagePastes).get(id)
      if (!state || !target) {
        emit('error', new Error('The selected passage changed. Paste the image again.'))
        return
      }
      const selection = state.selection.main
      const transaction = state.update({
        changes: { from: target.from, to: target.to, insert },
        selection:
          selection.from === target.from && selection.to === target.to
            ? { anchor: target.from + insert.length }
            : undefined,
        effects: removeImagePaste.of(id),
        annotations: isolateHistory.of('full'),
      })
      if (documentId === currentId) view.dispatch(transaction)
      else {
        states.set(documentId, transaction.state)
        emit('change', documentId, transaction.state.doc.toString())
      }
    })
    .catch((error: unknown) => {
      if (!view) return
      if (documentId === currentId) view.dispatch({ effects: removeImagePaste.of(id) })
      else {
        const state = states.get(documentId)
        if (state) states.set(documentId, state.update({ effects: removeImagePaste.of(id) }).state)
      }
      emit('error', error instanceof Error ? error : new Error('The image could not be pasted.'))
    })
  return true
}
function captureImage(position: number): ImageTarget | null {
  if (!view) return null
  const image = embeddedImages(view.state.doc.toString()).find((item) => item.from === position)
  if (!image) return null
  const id = Symbol('image target')
  view.dispatch({ effects: addImageTarget.of({ id, from: image.from, to: image.to }) })
  return {
    id,
    documentId: currentId,
    original: view.state.doc.sliceString(image.from, image.to),
    url: image.url,
    alt: image.alt,
  }
}
function releaseImage(target: ImageTarget) {
  if (!view) return
  if (target.documentId === currentId) view.dispatch({ effects: removeImageTarget.of(target.id) })
  else {
    const state = states.get(target.documentId)
    if (state)
      states.set(
        target.documentId,
        state.update({ effects: removeImageTarget.of(target.id) }).state,
      )
  }
}
function applyImageAlt(target: ImageTarget, alt: string): boolean {
  if (!view || target.documentId !== currentId) return false
  const mapped = view.state.field(imageTargets).get(target.id)
  if (!mapped || view.state.doc.sliceString(mapped.from, mapped.to) !== target.original)
    return false
  if (
    !embeddedImages(view.state.doc.toString()).some(
      (image) => image.from === mapped.from && image.to === mapped.to && image.url === target.url,
    )
  )
    return false
  view.dispatch({
    changes: { from: mapped.from, to: mapped.to, insert: imageMarkdown(alt, target.url) },
    effects: removeImageTarget.of(target.id),
    annotations: isolateHistory.of('full'),
  })
  return true
}
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
function applyReplacement(target: SelectionTarget, replacement: string): boolean {
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
function hasPendingImages(): boolean {
  return (
    Boolean(view?.state.field(pendingImagePastes).size) ||
    [...states.entries()].some(
      ([id, state]) => id !== currentId && state.field(pendingImagePastes).size > 0,
    )
  )
}
defineExpose({
  openSearch: () => {
    if (view) openSearchPanel(view)
  },
  captureImage,
  releaseImage,
  applyImageAlt,
  hasPendingImages,
  captureSelection,
  applyReplacement,
  selectRange,
  focus: () => view?.focus(),
})
</script>

<template>
  <div
    ref="host"
    class="document-editor"
    :class="{ 'typewriter-editor': preferences.typewriter }"
    :style="writingStyle(preferences)"
  />
</template>

<style scoped>
.document-editor {
  font-family: var(--writing-font);
  font-size: var(--writing-size);
  max-width: var(--writing-width);
  margin-inline: auto;
}
.typewriter-editor {
  padding-block: 40vh;
}
.document-editor :deep(.writing-dimmed) {
  opacity: 0.5;
}
.document-editor :deep(.cm-search) {
  font-family: system-ui, sans-serif;
  font-size: 13px;
  color: var(--ink);
  background: var(--paper);
  padding: 12px;
}
.document-editor :deep(.cm-search input),
.document-editor :deep(.cm-search button) {
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 4px;
}
</style>
