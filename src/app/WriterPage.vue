<script setup lang="ts">
import { BaseInput } from '../shared/ui/input'
import { BaseTextarea } from '../shared/ui/textarea'
import { BaseButton } from '../shared/ui/button'
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
} from '@lucide/vue'
import { DocumentEditor, embeddedImages, imageAwareWordCount } from '../features/editor/ui'
import { hasUnsecuredChanges } from '../features/documents'
import { recoveryStatusText, diskStatusText } from '../features/documents/ui'
import type { WriterServices } from './bootstrap'
import { createSuggestionSession } from './application/suggestionSession'
import { suggestionNoticeText } from './suggestionNotice'
import { saveBeforeUpdate, type RegisterAppUpdate } from './application/appUpdate'
import type { ImageTarget } from '../features/editor/ui'
import type { ModelFiles } from '../features/assistance'
import { ModelSettings } from '../features/assistance/ui'
import { checkWriting, type WritingAction } from '../features/assistance'
import { AssistancePanel } from '../features/assistance/ui'
import { DocumentList } from '../features/documents/ui'
const props = defineProps<{ services: WriterServices; registerUpdates?: RegisterAppUpdate | undefined }>()
const { services } = props
const { workspace, assistant, captions } = services
const updateAvailable = ref(false)
const updating = ref(false)
const workspaceReady = ref(false)
let updateActivated = false
let updateRequested = false
let activateUpdate: (() => Promise<void>) | undefined
const captionState = shallowRef(captions.snapshot())
const writingFiles = ref<ModelFiles>('unknown')
const notice = ref('')
const state = shallowRef(workspace.snapshot())
const assistantState = shallowRef(assistant.snapshot())
const releases = [
  captions.subscribe(snapshot => { captionState.value = snapshot }),
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
const dark = ref(preference('alexopwriter-dark', true))
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
const altInput = useTemplateRef<InstanceType<typeof BaseTextarea>>('altInput')
let imageReturnFocus: HTMLElement | null = null
const settingsButton = useTemplateRef<InstanceType<typeof BaseButton>>('settingsButton')
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
  await Promise.all([captions.refresh(), services.inspectWritingFiles().then((files) => { if (request === inventoryRequest) writingFiles.value = files })])
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
const active = computed(() =>
  state.value.documents.find(
    (document) => document.id === state.value.activeId,
  ),
)
const issues = computed(() => checkWriting(active.value?.text ?? ''))
const words = computed(
  () => imageAwareWordCount(active.value?.text ?? ''),
)
watch(() => state.value.activeId, () => { if (imageTarget.value) closeImage() })
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
        <BaseButton
          size="icon"
          aria-label="Toggle documents"
          :aria-expanded="sidebar && !focusMode"
          @click="toggleDocuments"
        >
          <PanelLeft :size="18" />
        </BaseButton>
        <span class="brand">alexopwriter</span>
      </div>
      <BaseInput
        variant="ghost"
        v-if="active"
        class="document-title"
        aria-label="Document name"
        :model-value="active.name"
        @change="renamed"
      />
      <nav aria-label="Document actions" class="toolbar">
        <BaseButton aria-label="New document" @click="workspace.create()">
          <Plus :size="15" /><span>New</span>
        </BaseButton>
        <BaseButton aria-label="Open file" @click="workspace.open()">
          <FolderOpen :size="15" /><span>Open</span>
        </BaseButton>
        <BaseButton
          :disabled="!active"
          aria-label="Save"
          @click="active && workspace.save(active.id)"
        >
          <Check :size="15" /><span>Save</span>
        </BaseButton>
        <BaseButton
          size="icon"
          aria-label="Download copy"
          :disabled="!active"
          @click="download"
        >
          <Download :size="16" />
        </BaseButton>
        <span class="toolbar-divider" />
        <div class="page-tools">
          <BaseButton
            aria-label="Writing checks"
            :aria-expanded="panel === 'review'"
            @click="togglePanel('review')"
          >
            <SlidersHorizontal :size="14" />Review<span
              v-if="issues.length"
              class="count"
              >{{ issues.length }}</span
            ></BaseButton
          ><BaseButton
            aria-label="Local writing help"
            :aria-expanded="panel === 'assist'"
            @click="togglePanel('assist')"
          >
            <Feather :size="14" /><span class="help-label">Writing help</span>
          </BaseButton>
        </div>
        <BaseButton ref="settingsButton" aria-label="Settings" :aria-expanded="panel === 'settings'" @click="openSettings">Settings</BaseButton>
        <span class="toolbar-divider" />
        <BaseButton
          size="icon"
          aria-label="Dark mode"
          :aria-pressed="dark"
          @click="dark = !dark"
        >
          <Sun v-if="dark" :size="17" /><Moon v-else :size="17" />
        </BaseButton>
        <BaseButton
          size="icon"
          aria-label="Focus mode"
          :aria-pressed="focusMode"
          @click="focusMode = !focusMode"
        >
          <Minimize v-if="focusMode" :size="17" /><Maximize v-else :size="17" />
        </BaseButton>
      </nav>
    </header>
    <div v-if="updateAvailable" class="update-banner" role="status">
      <span>A new version is ready. Update reloads the app after saving your drafts.</span>
      <BaseButton :disabled="updating || !workspaceReady" @click="applyUpdate">
        {{ updating ? 'Saving drafts…' : 'Update app' }}
      </BaseButton>
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
            @image="openImage"
          />
        </div>
        <div v-else class="empty-state">
          <Feather :size="32" />
          <h1>A little room to think.</h1>
          <p>Open a file or start with a blank page.</p>
          <BaseButton @click="workspace.create()">
            Start writing <ArrowRight :size="15" />
          </BaseButton>
        </div>
      </main>
      <aside
        v-if="panel === 'image' || panel === 'settings'"
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
          <BaseButton
            size="icon"
            aria-label="Close panel"
            @click="closePanel"
          >
            <X :size="17" />
          </BaseButton>
        </div>
        <ModelSettings v-if="panel === 'settings'" :caption="captionState" :writing="assistantState" :writing-files="writingFiles" @download-caption="downloadCaption" @cancel-caption="captions.cancel()" @remove-caption="removeCaption" @enable-writing="enable" @cancel-writing="session.cancel()" @remove-writing="removeModel" />
        <template v-else-if="panel === 'image' && imageTarget">
          <section class="image-description" @keydown.esc.stop="closeImage">
            <img :src="imageTarget.url" :alt="imageTarget.alt" class="alt-preview" />
            <p class="panel-description">Describe what matters about this image in your document.</p>
            <label for="image-alt">Alt text</label>
            <BaseTextarea id="image-alt" ref="altInput" v-model="altDraft" rows="5" />
            <p class="panel-description">Leave empty for a decorative image.</p>
            <template v-if="captionState.phase === 'generating'">
              <p role="status">{{ captionState.message }}</p>
              <BaseButton @click="captionEpoch++; captions.cancel()">Cancel generation</BaseButton>
            </template>
            <BaseButton v-else-if="captionState.files === 'available'" @click="generateAlt">Generate alt text</BaseButton>
            <BaseButton v-else @click="openSettings">Set up local generation</BaseButton>
            <p class="panel-description">Generated descriptions are in English. Check details, especially text and charts.</p>
            <div class="proposal-actions">
              <BaseButton variant="primary" @click="applyAlt">Apply alt text</BaseButton>
              <BaseButton @click="closeImage">Cancel</BaseButton>
            </div>
          </section>
        </template>
      </aside>
      <AssistancePanel v-if="panel === 'review' || panel === 'assist'" :panel="panel" :issues="issues" :assistant-state="assistantState"
        :selected="selected" :proposal="suggestion.proposal"
        @close="closePanel" @settings="openSettings" @select-range="(from, to) => editor?.selectRange(from, to)"
        @apply-issue="applyIssue"
        @accept="accept" @discard="session.discard()" @suggest="suggest" />
    </div>
    <div v-if="displayNotice" class="app-notice" role="status">
      <span>{{ displayNotice }}</span
      ><BaseButton
        size="icon"
        variant="inverse"
        aria-label="Dismiss notification"
        @click="dismissNotice"
      >
        <X :size="14" />
      </BaseButton>
    </div>
    <footer class="statusbar">
      <div>
        <BaseButton
          aria-label="Vim mode"
          :aria-pressed="vimEnabled"
          class="mode-button"
          @click="vimEnabled = !vimEnabled"
        >
          {{ mode }}</BaseButton
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
