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
  FileText,
} from '@lucide/vue'
import { saveBeforeUpdate, type RegisterAppUpdate } from './appUpdate'
import { embeddedImages, imageAwareWordCount } from './editor/images'
import DocumentEditor from './components/DocumentEditor.vue'
import type { SelectionTarget } from './components/DocumentEditor.vue'
import { createWorkspace } from './documents/workspace'
import { checkWriting, createLocalAssistant, MODEL_INFO } from './assistance'
const props = defineProps<{ registerUpdates?: RegisterAppUpdate }>()
const updateAvailable = ref(false)
const updating = ref(false)
const workspaceReady = ref(false)
let updateActivated = false
let updateRequested = false
let activateUpdate: (() => Promise<void>) | undefined
const workspace = createWorkspace()
const state = shallowRef(workspace.snapshot())
const assistant = createLocalAssistant()
const assistantState = shallowRef(assistant.snapshot())
const releases = [
  workspace.subscribe((snapshot) => {
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
const notice = ref('')
const proposal = shallowRef<{ target: SelectionTarget; text: string } | null>(
  null,
)
const active = computed(() =>
  state.value.documents.find(
    (document) => document.id === state.value.activeId,
  ),
)
const issues = computed(() => checkWriting(active.value?.text ?? ''))
const words = computed(
  () => imageAwareWordCount(active.value?.text ?? ''),
)
let requestEpoch = 0
watch(
  () => state.value.activeId,
  () => {
    requestEpoch += 1
    proposal.value = null
    notice.value = ''
    if (assistantState.value.phase === 'running') assistant.cancel()
  },
)
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
  const unsafe = state.value.documents.some(
    (document) =>
      document.recoveryStatus !== 'Draft saved in browser' ||
      (document.hasDiskBinding && document.diskStatus !== 'Saved to disk'),
  )
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
async function reloadUpdatedApp() {
  try {
    await saveBeforeUpdate(workspace, () => editor.value?.hasPendingImages() ?? false)
    window.location.reload()
  } catch (error) {
    reportError(error instanceof Error ? error : new Error('Could not update the app.'))
  }
}
async function applyUpdate() {
  if (updating.value || !workspaceReady.value) return
  updating.value = true
  try {
    await saveBeforeUpdate(workspace, () => editor.value?.hasPendingImages() ?? false)
    if (updateActivated) window.location.reload()
    else {
      updateRequested = true
      await activateUpdate?.()
    }
  } catch (error) {
    updateRequested = false
    reportError(error instanceof Error ? error : new Error('Could not update the app.'))
  } finally {
    updating.value = false
  }
}
onMounted(async () => {
  activateUpdate = props.registerUpdates?.({
    onNeedRefresh() { updateAvailable.value = true },
    onNeedReload() {
      updateActivated = true
      updateAvailable.value = true
      // Another tab may activate the worker. Reload only after this tab asks.
      if (updateRequested) {
        updateRequested = false
        void reloadUpdatedApp()
      }
    },
  })
  window.addEventListener('beforeunload', beforeUnload)
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('keydown', shortcut)
  try {
    await workspace.initialize()
    if (!workspace.snapshot().documents.length) await workspace.create()
    workspaceReady.value = true
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
  if (file) void workspace.importFile(file).catch(reportError)
  event.target.value = ''
}
function toggleDocuments() {
  sidebar.value = !sidebar.value
  focusMode.value = false
}
function activateDocument(id: string) {
  workspace.activate(id)
  proposal.value = null
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
async function suggest(action: 'shorten' | 'clarify' | 'heading') {
  const target = editor.value?.captureSelection()
  if (!target) {
    notice.value = 'Select a passage in your document first.'
    return
  }
  if (embeddedImages(target.text).length) {
    notice.value = 'Select text without images to request writing help.'
    return
  }
  notice.value = ''
  proposal.value = null
  const epoch = ++requestEpoch
  try {
    const text = await assistant.suggest(action, target.text)
    if (epoch !== requestEpoch || active.value?.id !== target.documentId) return
    if (active.value.revision !== target.revision) {
      notice.value = 'Your document changed. Select the passage and try again.'
      return
    }
    proposal.value = { target, text }
  } catch (error) {
    if (epoch === requestEpoch)
      notice.value =
        error instanceof Error
          ? error.message
          : 'The suggestion could not be completed.'
  }
}
function accept() {
  if (!proposal.value) return
  notice.value = editor.value?.applyReplacement(
    proposal.value.target,
    proposal.value.text,
  )
    ? 'Suggestion applied. Undo will restore your original.'
    : 'Your document changed. Select the passage and request a fresh suggestion.'
  proposal.value = null
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
    <div v-if="updateAvailable" class="update-banner" role="status">
      <span>A new version is ready. Update reloads the app after saving your drafts.</span>
      <button :disabled="updating || !workspaceReady" @click="applyUpdate">
        {{ updating ? 'Saving drafts…' : 'Update app' }}
      </button>
    </div>
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
      <aside
        v-if="sidebar && !focusMode"
        class="documents"
        aria-label="Documents"
      >
        <div class="section-heading">
          <span>Documents</span
          ><button
            class="icon-button"
            aria-label="Create document"
            @click="workspace.create()"
          >
            <Plus :size="15" />
          </button>
        </div>
        <div class="document-list">
          <button
            v-for="document in state.documents"
            :key="document.id"
            class="document-item"
            :class="{ active: document.id === state.activeId }"
            :aria-current="document.id === state.activeId ? 'page' : undefined"
            @click="activateDocument(document.id)"
          >
            <FileText :size="15" /><span>{{ document.name }}</span
            ><span v-if="document.id === state.activeId" class="active-dot" />
          </button>
        </div>
        <button class="import-action" @click="importer?.click()">
          <FolderOpen :size="15" />Import file
        </button>
        <div class="local-note">
          <span class="local-dot" />On your device
          <p>
            Drafts stay in this browser.<br />Save a copy to keep them on disk.
          </p>
        </div>
      </aside>
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
      <aside
        v-if="panel"
        class="review-panel"
        :aria-label="
          panel === 'review' ? 'Writing review' : 'Local writing help'
        "
      >
        <div class="panel-header">
          <h2>
            {{ panel === 'review' ? 'Writing review' : 'Writing help' }}
          </h2>
          <button
            class="icon-button"
            aria-label="Close panel"
            @click="panel = null"
          >
            <X :size="17" />
          </button>
        </div>
        <template v-if="panel === 'review'">
          <p class="panel-description">
            Small suggestions. Your voice stays yours.
          </p>
          <span class="eyebrow"
            >{{ issues.length }}
            {{ issues.length === 1 ? 'SUGGESTION' : 'SUGGESTIONS' }} · NO MODEL
            NEEDED</span
          >
          <div v-if="!issues.length" class="review-empty">
            <Check :size="22" />
            <p>No issues found by these checks.<br />Keep going.</p>
          </div>
          <article v-for="issue in issues" :key="issue.id" class="issue-card">
            <button
              class="issue-excerpt"
              @click="editor?.selectRange(issue.from, issue.to)"
            >
              {{ issue.text }}
            </button>
            <p>{{ issue.message }}</p>
            <button
              v-if="issue.replacement !== undefined"
              class="text-action"
              @click="applyIssue(issue.from, issue.to, issue.replacement)"
            >
              Use “{{ issue.replacement }}” <ArrowRight :size="13" />
            </button>
          </article>
        </template>
        <template v-else>
          <p class="panel-description">
            Optional assistance that runs on your device. Select a passage, then
            choose what you need.
          </p>
          <div class="model-card">
            <span class="eyebrow">LOCAL MODEL</span>
            <h3>{{ MODEL_INFO.name }}</h3>
            <p>
              {{ MODEL_INFO.downloadLabel }} download. Text is processed in this
              browser. English writing quality may vary.
            </p>
            <button
              v-if="
                assistantState.phase === 'disabled' ||
                assistantState.phase === 'error'
              "
              class="primary-button"
              @click="enable"
            >
              Download &amp; enable <Download :size="14" />
            </button>
            <template v-if="busy"
              ><progress
                :value="assistantState.progress"
                max="100"
                aria-label="Model progress"
              />
              <p role="status">{{ assistantState.message }}</p>
              <button @click="assistant.cancel()">Cancel</button></template
            >
            <p v-if="assistantState.phase === 'ready'" class="ready-state">
              <span class="local-dot" />Ready on this device
            </p>
          </div>
          <div v-if="assistantState.phase === 'ready'" class="assist-actions">
            <p>
              {{
                selected
                  ? 'Work with your selected passage.'
                  : 'Select some text in the editor to begin.'
              }}
            </p>
            <button :disabled="!selected" @click="suggest('shorten')">
              Make it shorter <ArrowRight :size="14" /></button
            ><button :disabled="!selected" @click="suggest('clarify')">
              Make it clearer <ArrowRight :size="14" /></button
            ><button :disabled="!selected" @click="suggest('heading')">
              Suggest a heading <ArrowRight :size="14" />
            </button>
          </div>
          <div v-if="proposal" class="proposal">
            <span class="eyebrow">SUGGESTED WORDING</span>
            <p>{{ proposal.text }}</p>
            <div class="proposal-actions">
              <button class="primary-button" @click="accept">Accept</button
              ><button @click="proposal = null">Discard</button>
            </div>
          </div>
          <button
            v-if="!busy"
            class="text-action remove-model"
            @click="removeModel"
          >
            Remove downloaded model
          </button>
        </template>
      </aside>
    </div>
    <div v-if="notice" class="app-notice" role="status">
      <span>{{ notice }}</span
      ><button
        class="icon-button"
        aria-label="Dismiss notification"
        @click="notice = ''"
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
          ><span>{{ active.recoveryStatus }}</span
          ><span class="status-separator"> · </span
          ><span>{{ active.diskStatus }}</span></span
        ><span v-else>Local-first writing</span>
      </div>
    </footer>
  </div>
</template>
