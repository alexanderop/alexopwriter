<script setup lang="ts">
import {
  computed,
  nextTick,
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
import { embeddedImages, imageAwareWordCount, type ImageTarget } from './editor/images'
import DocumentEditor from './components/DocumentEditor.vue'
import type { SelectionTarget } from './components/DocumentEditor.vue'
import ModelSettings from './components/ModelSettings.vue'
import { createImageCaption, type ImageCaption } from './assistance/imageCaption'
import { inspectModelFiles, type ModelFiles } from './assistance/modelAssets'
import { createWorkspace } from './documents/workspace'
import { checkWriting, createLocalAssistant } from './assistance'
const props = defineProps<{ registerUpdates?: RegisterAppUpdate; createCaption?: () => ImageCaption }>()
const updateAvailable = ref(false)
const updating = ref(false)
const workspaceReady = ref(false)
let updateActivated = false
let updateRequested = false
let activateUpdate: (() => Promise<void>) | undefined
const workspace = createWorkspace()
const state = shallowRef(workspace.snapshot())
const captions = (props.createCaption ?? createImageCaption)()
const captionState = shallowRef(captions.snapshot())
const writingFiles = ref<ModelFiles>('unknown')
const assistant = createLocalAssistant()
const assistantState = shallowRef(assistant.snapshot())
const releases = [
  captions.subscribe((snapshot) => { captionState.value = snapshot }),
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
const panel = ref<'review' | 'assist' | 'image' | 'settings' | null>(null)
const imageTarget = shallowRef<ImageTarget | null>(null)
const altDraft = ref('')
const altInput = useTemplateRef<HTMLTextAreaElement>('altInput')
let imageReturnFocus: HTMLElement | null = null
const settingsButton = useTemplateRef<HTMLButtonElement>('settingsButton')
const panelHost = useTemplateRef<HTMLElement>('panelHost')
let captionEpoch = 0
let altRevision = 0
watch(altDraft, () => { altRevision++ }, { flush: 'sync' })
function closeImage() {
  captionEpoch++
  if (captionState.value.phase === 'generating') captions.cancel()
  if (imageTarget.value) editor.value?.releaseImage(imageTarget.value)
  imageTarget.value = null
  if (panel.value === 'image') panel.value = null
  if (imageReturnFocus?.isConnected) imageReturnFocus.focus()
  else editor.value?.focus()
  imageReturnFocus = null
}
function openImage(target: ImageTarget) {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  if (imageTarget.value) closeImage()
  imageReturnFocus = returnFocus
  imageTarget.value = target
  altDraft.value = target.alt
  panel.value = 'image'
  void captions.refresh()
  void nextTick(() => altInput.value?.focus())
}
let inventoryRequest = 0
async function refreshModels() {
  const request = ++inventoryRequest
  await Promise.all([captions.refresh(), inspectModelFiles('writing').then((files) => { if (request === inventoryRequest) writingFiles.value = files })])
}
function openSettings() {
  if (imageTarget.value) closeImage()
  panel.value = 'settings'
  void nextTick(() => panelHost.value?.focus())
  void refreshModels()
}
async function downloadCaption() {
  try { await captions.download() } catch (error) { reportError(error instanceof Error ? error : new Error('Image model download failed.')) }
}
async function removeCaption() {
  try { await captions.remove() } catch (error) { reportError(error instanceof Error ? error : new Error('Could not remove image model.')) }
}
async function generateAlt() {
  const target = imageTarget.value
  if (!target) return
  const request = ++captionEpoch
  const draftAtStart = altRevision
  try {
    const text = await captions.describe(target.url)
    if (request !== captionEpoch || imageTarget.value !== target) return
    if (draftAtStart !== altRevision) {
      notice.value = 'Your alt text changed while generating. Kept your edit; generate again if needed.'
      return
    }
    altDraft.value = text
    notice.value = 'Description drafted. Check details, especially text and charts, then apply.'
  } catch (error) {
    if (request === captionEpoch) reportError(error instanceof Error ? error : new Error('Could not describe image.'))
  }
}
function closePanel() {
  if (imageTarget.value) closeImage()
  else { const settings = panel.value === 'settings'; panel.value = null; if (settings) settingsButton.value?.focus(); else editor.value?.focus() }
}
function applyAlt() {
  if (!imageTarget.value) return
  if (!editor.value?.applyImageAlt(imageTarget.value, altDraft.value)) {
    notice.value = 'This image changed. Select it again to edit its alt text.'
    closeImage()
    return
  }
  closeImage()
}
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
    if (imageTarget.value) closeImage()
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
  captions.dispose()
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
  if (imageTarget.value) closeImage()
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
    await refreshModels()
  } catch (error) {
    notice.value =
      error instanceof Error ? error.message : 'The model could not be loaded.'
  }
}
async function removeModel() {
  try {
    await assistant.remove()
    await refreshModels()
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
        <button ref="settingsButton" aria-label="Settings" :aria-expanded="panel === 'settings'" @click="openSettings">Settings</button>
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
            @image="openImage"
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
        ref="panelHost"
        tabindex="-1"
        class="review-panel"
        @keydown.esc.stop="closePanel"
        :aria-label="
          panel === 'settings' ? 'Settings' : panel === 'image' ? 'Image description' : panel === 'review' ? 'Writing review' : 'Local writing help'
        "
      >
        <div class="panel-header">
          <h2>
            {{ panel === 'settings' ? 'Settings' : panel === 'image' ? 'Image description' : panel === 'review' ? 'Writing review' : 'Writing help' }}
          </h2>
          <button
            class="icon-button"
            aria-label="Close panel"
            @click="closePanel"
          >
            <X :size="17" />
          </button>
        </div>
        <ModelSettings v-if="panel === 'settings'" :caption="captionState" :writing="assistantState" :writing-files="writingFiles" @download-caption="downloadCaption" @cancel-caption="captions.cancel()" @remove-caption="removeCaption" @enable-writing="enable" @cancel-writing="assistant.cancel()" @remove-writing="removeModel" />
        <template v-else-if="panel === 'image' && imageTarget">
          <section class="image-description" @keydown.esc.stop="closeImage">
            <img :src="imageTarget.url" :alt="imageTarget.alt" class="alt-preview" />
            <p class="panel-description">Describe what matters about this image in your document.</p>
            <label for="image-alt">Alt text</label>
            <textarea id="image-alt" ref="altInput" v-model="altDraft" rows="5" />
            <p class="panel-description">Leave empty for a decorative image.</p>
            <template v-if="captionState.phase === 'generating'">
              <p role="status">{{ captionState.message }}</p>
              <button @click="captionEpoch++; captions.cancel()">Cancel generation</button>
            </template>
            <button v-else-if="captionState.files === 'available'" @click="generateAlt">Generate alt text</button>
            <button v-else @click="openSettings">Set up local generation</button>
            <p class="panel-description">Generated descriptions are in English. Check details, especially text and charts.</p>
            <div class="proposal-actions">
              <button class="primary-button" @click="applyAlt">Apply alt text</button>
              <button @click="closeImage">Cancel</button>
            </div>
          </section>
        </template>
        <template v-else-if="panel === 'review'">
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
          <p class="panel-description">{{ assistantState.message }}</p>
          <button @click="openSettings">Manage models in Settings</button>
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
