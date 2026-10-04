<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'
import {
  PanelLeft,
  Plus,
  FolderOpen,
  Download,
  Check,
  Moon,
  Sun,
  Maximize,
  Minimize,
  X,
  Feather,
  SlidersHorizontal,
  ArrowRight,
} from '@lucide/vue'
import { DocumentEditor, embeddedImages, imageAwareWordCount } from '../editor/ui'
import { hasUnsecuredChanges } from '../documents'
import { recoveryStatusText, diskStatusText } from '../documents/ui'
import type { WriterServices } from './bootstrap'
import { createSuggestionSession } from './application/suggestionSession'
import { suggestionNoticeText } from './suggestionNotice'
import { checkWriting, type WritingAction } from '../assistance'
import { AssistancePanel } from '../assistance/ui'
import { DocumentList } from '../documents/ui'
const { services } = defineProps<{ services: WriterServices }>()
const { workspace, assistant } = services
const notice = ref('')
const state = shallowRef(workspace.snapshot())
const assistantState = shallowRef(assistant.snapshot())
const releases = [
  workspace.subscribe((snapshot) => {
    if (snapshot.activeId !== state.value.activeId) notice.value = ''
    state.value = snapshot
  }),
  assistant.subscribe((snapshot) => {
    assistantState.value = snapshot
  }),
]
const editor = useTemplateRef<InstanceType<typeof DocumentEditor>>('editor')
const importer = useTemplateRef<HTMLInputElement>('importer')
const sidebar = ref(window.matchMedia('(min-width: 581px)').matches)
const focusMode = ref(false)
function preference(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === 'true'
  } catch {
    return fallback
  }
}
const dark = ref(preference('alexopwriter-dark', false))
const vimEnabled = ref(preference('alexopwriter-vim', true))
watch([dark, vimEnabled], () => {
  try {
    localStorage.setItem('alexopwriter-dark', String(dark.value))
    localStorage.setItem('alexopwriter-vim', String(vimEnabled.value))
  } catch {
    return
  }
})
const mode = ref('NORMAL')
const panel = ref<'review' | 'assist' | null>(null)
const selected = ref(false)
const active = computed(() =>
  state.value.documents.find(
    (document) => document.id === state.value.activeId,
  ),
)
const issues = computed(() => checkWriting(active.value?.text ?? ''))
const words = computed(
  () => imageAwareWordCount(active.value?.text ?? ''),
)
const session = createSuggestionSession({
  workspace,
  assistant,
  editor: {
    captureSelection: () => editor.value?.captureSelection() ?? null,
    applyReplacement: (target, text) => editor.value?.applyReplacement(target, text) ?? false,
  },
  canSuggest: text => embeddedImages(text).length === 0,
})
const suggestion = shallowRef(session.snapshot())
releases.push(session.subscribe(snapshot => { suggestion.value = snapshot }))
const displayNotice = computed(() => notice.value || suggestionNoticeText(suggestion.value.notice))
function dismissNotice() {
  notice.value = ''
  session.dismissNotice()
}
const busy = computed(
  () =>
    assistantState.value.phase === 'running' ||
    assistantState.value.phase === 'loading',
)
function reportError(error: Error) {
  notice.value =
    error instanceof Error
      ? error.message
      : 'The operation could not be completed.'
}
function beforeUnload(event: BeforeUnloadEvent) {
  const unsafe = state.value.documents.some(hasUnsecuredChanges)
  if (unsafe) {
    event.preventDefault()
    event.returnValue = ''
  }
}
function visibilityChanged() {
  if (document.visibilityState === 'hidden')
    void workspace.flush().catch(reportError)
}
function shortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (active.value) void workspace.save(active.value.id).catch(reportError)
  }
}
onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload)
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('keydown', shortcut)
  try {
    await workspace.initialize()
    if (!workspace.snapshot().documents.length) await workspace.create()
  } catch (error) {
    reportError(
      error instanceof Error ? error : new Error('Could not open workspace.'),
    )
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  document.removeEventListener('visibilitychange', visibilityChanged)
  window.removeEventListener('keydown', shortcut)
  releases.forEach((release) => release())
  session.dispose()
  assistant.dispose()
  void workspace.dispose().catch(reportError)
})
function download() {
  if (!active.value) return
  workspace.download(active.value.id)
  notice.value = 'Download requested. Your original file is unchanged.'
}
function renamed(event: Event) {
  if (active.value && event.target instanceof HTMLInputElement)
    workspace.rename(active.value.id, event.target.value)
}
function imported(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return
  const file = event.target.files?.[0]
  if (file) void file.text().then(text => workspace.importDocument({ name: file.name, text })).catch(reportError)
  event.target.value = ''
}
function toggleDocuments() {
  sidebar.value = !sidebar.value
  focusMode.value = false
}
function activateDocument(id: string) {
  workspace.activate(id)
}
function togglePanel(next: 'review' | 'assist') {
  panel.value = panel.value === next ? null : next
}
function changed(id: string, text: string) {
  workspace.edited(id, text)
}
function applyIssue(from: number, to: number, replacement: string) {
  const target = editor.value?.selectRange(from, to)
  if (target) editor.value?.applyReplacement(target, replacement)
}
async function suggest(action: WritingAction) {
  notice.value = ''
  await session.suggest(action)
}
function accept() {
  notice.value = ''
  session.accept()
}
async function enable() {
  try {
    await assistant.enable()
  } catch (error) {
    notice.value =
      error instanceof Error ? error.message : 'The model could not be loaded.'
  }
}
async function removeModel() {
  try {
    await assistant.remove()
  } catch (error) {
    notice.value =
      error instanceof Error ? error.message : 'The model could not be removed.'
  }
}
</script>

<template>
  <div class="app-shell" :class="{ dark, focused: focusMode }">
    <header class="topbar">
      <div class="brand-group">
        <button
          class="icon-button"
          aria-label="Toggle documents"
          :aria-expanded="sidebar && !focusMode"
          @click="toggleDocuments"
        >
          <PanelLeft :size="18" />
        </button>
        <span class="brand">alexopwriter</span>
      </div>
      <input
        v-if="active"
        class="document-title"
        aria-label="Document name"
        :value="active.name"
        @change="renamed"
      />
      <nav aria-label="Document actions" class="toolbar">
        <button aria-label="New document" @click="workspace.create()">
          <Plus :size="15" /><span>New</span>
        </button>
        <button aria-label="Open file" @click="workspace.open()">
          <FolderOpen :size="15" /><span>Open</span>
        </button>
        <button
          :disabled="!active"
          aria-label="Save"
          @click="active && workspace.save(active.id)"
        >
          <Check :size="15" /><span>Save</span>
        </button>
        <button
          class="icon-button"
          aria-label="Download copy"
          :disabled="!active"
          @click="download"
        >
          <Download :size="16" />
        </button>
        <span class="toolbar-divider" />
        <div class="page-tools">
          <button
            aria-label="Writing checks"
            :aria-expanded="panel === 'review'"
            @click="togglePanel('review')"
          >
            <SlidersHorizontal :size="14" />Review<span
              v-if="issues.length"
              class="count"
              >{{ issues.length }}</span
            ></button
          ><button
            aria-label="Local writing help"
            :aria-expanded="panel === 'assist'"
            @click="togglePanel('assist')"
          >
            <Feather :size="14" /><span class="help-label">Writing help</span>
          </button>
        </div>
        <span class="toolbar-divider" />
        <button
          class="icon-button"
          aria-label="Dark mode"
          :aria-pressed="dark"
          @click="dark = !dark"
        >
          <Sun v-if="dark" :size="17" /><Moon v-else :size="17" />
        </button>
        <button
          class="icon-button"
          aria-label="Focus mode"
          :aria-pressed="focusMode"
          @click="focusMode = !focusMode"
        >
          <Minimize v-if="focusMode" :size="17" /><Maximize v-else :size="17" />
        </button>
      </nav>
    </header>
    <input
      ref="importer"
      type="file"
      accept=".md,.markdown,.txt,text/plain,text/markdown"
      hidden
      aria-label="Import document"
      @change="imported"
    />
    <div v-if="state.error" class="error-banner" role="alert">
      {{ state.error }}
    </div>
    <div class="workspace">
      <DocumentList v-if="sidebar && !focusMode" :documents="state.documents" :active-id="state.activeId"
        @create="workspace.create()" @activate="activateDocument" @import="importer?.click()" />
      <main class="writing-area">
        <div v-if="active" class="page">
          <DocumentEditor
            ref="editor"
            :document-id="active.id"
            :text="active.text"
            :revision="active.revision"
            :vim-enabled="vimEnabled"
            @change="changed"
            @error="reportError"
            @mode="mode = $event"
            @selection="selected = $event"
          />
        </div>
        <div v-else class="empty-state">
          <Feather :size="32" />
          <h1>A little room to think.</h1>
          <p>Open a file or start with a blank page.</p>
          <button @click="workspace.create()">
            Start writing <ArrowRight :size="15" />
          </button>
        </div>
      </main>
      <AssistancePanel v-if="panel" :panel="panel" :issues="issues" :assistant-state="assistantState"
        :busy="busy" :selected="selected" :proposal="suggestion.proposal"
        @close="panel = null" @select-range="(from, to) => editor?.selectRange(from, to)"
        @apply-issue="applyIssue" @enable="enable" @cancel="session.cancel()" @remove="removeModel"
        @accept="accept" @discard="session.discard()" @suggest="suggest" />
    </div>
    <div v-if="displayNotice" class="app-notice" role="status">
      <span>{{ displayNotice }}</span
      ><button
        class="icon-button"
        aria-label="Dismiss notification"
        @click="dismissNotice"
      >
        <X :size="14" />
      </button>
    </div>
    <footer class="statusbar">
      <div>
        <button
          aria-label="Vim mode"
          :aria-pressed="vimEnabled"
          class="mode-button"
          @click="vimEnabled = !vimEnabled"
        >
          {{ mode }}</button
        ><span>{{ words.toLocaleString() }} words</span
        ><span class="status-separator">/</span
        ><span>{{ Math.max(1, Math.ceil(words / 200)) }} min read</span>
      </div>
      <div class="save-state" aria-live="polite">
        <span v-if="active"
          ><span>{{ recoveryStatusText(active.recoveryStatus) }}</span
          ><span class="status-separator"> · </span
          ><span>{{ diskStatusText(active.diskStatus) }}</span></span
        ><span v-else>Local-first writing</span>
      </div>
    </footer>
  </div>
</template>
