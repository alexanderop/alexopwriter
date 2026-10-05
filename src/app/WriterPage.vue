<script setup lang="ts">
import { BaseInput } from '../shared/ui/input'
import { BaseTextarea } from '../shared/ui/textarea'
import { BaseButton } from '../shared/ui/button'
import { BaseDialog } from '../shared/ui/dialog'
import QuickNavigation from './QuickNavigation.vue'
import CommandPalette from './CommandPalette.vue'
import {
  shortcutStroke,
  shortcutLabel,
  characterShortcut,
  commandShortcutLabel,
  type WriterCommand,
} from './shortcuts'
import {
  defaultWritingPreferences,
  parseWritingPreferences,
  writingStyle,
  type WritingPreferences,
} from '../features/editor'
import { WritingSettings } from '../features/editor/ui'
import { DocumentPreview } from '../features/reading/ui'
import type { ExportFormat } from '../features/reading'
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
  Search,
  Compass,
  BookOpen,
  FileOutput,
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
const props = defineProps<{
  services: WriterServices
  registerUpdates?: RegisterAppUpdate | undefined
}>()
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
  captions.subscribe((snapshot) => {
    captionState.value = snapshot
  }),
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
const viewMode = ref<'write' | 'split' | 'read'>('write')
const navigationOpen = ref(false)
const navigationMode = ref<'documents' | 'headings'>('documents')
const commandsOpen = ref(false)
let pendingCommand: WriterCommand | undefined
const chord = ref(false)
let chordTimer: ReturnType<typeof setTimeout> | undefined
const mac = navigator.platform.includes('Mac')
const shortcutsOpen = ref(false)
const exportOpen = ref(false)
const exporting = ref(false)
function readWritingPreferences(): WritingPreferences {
  try {
    return parseWritingPreferences(
      JSON.parse(localStorage.getItem('alexopwriter-writing') ?? 'null'),
    )
  } catch {
    return { ...defaultWritingPreferences }
  }
}
const writingPreferences = ref<WritingPreferences>(readWritingPreferences())
watch(
  writingPreferences,
  (value) => {
    try {
      localStorage.setItem('alexopwriter-writing', JSON.stringify(value))
    } catch {
      return
    }
  },
  { deep: true },
)
const previewHost = useTemplateRef<HTMLElement>('previewHost')
function focusEditor() {
  void nextTick(() => {
    if (viewMode.value === 'read') previewHost.value?.querySelector<HTMLElement>('article')?.focus()
    else editor.value?.focus()
  })
}
function readOnly() {
  viewMode.value = 'read'
  focusEditor()
}
function toggleFocus() {
  focusMode.value = !focusMode.value
  if (focusMode.value) {
    closePanel()
    viewMode.value = 'write'
  }
  focusEditor()
}
function togglePreview() {
  focusMode.value = false
  viewMode.value = viewMode.value === 'write' ? 'split' : 'write'
  if (viewMode.value === 'write') focusEditor()
}
function findText() {
  viewMode.value = 'write'
  void nextTick(() => editor.value?.openSearch())
}
function navigateHeading(from: number, to: number) {
  viewMode.value = 'write'
  void nextTick(() => editor.value?.selectRange(from, to))
}
async function exportDocument(format: ExportFormat) {
  if (!active.value || exporting.value) return
  const source = { name: active.value.name, text: active.value.text }
  exporting.value = true
  try {
    await services.documentExport.export(source, format)
    exportOpen.value = false
  } catch (error) {
    reportError(error instanceof Error ? error : new Error('Could not export document.'))
  } finally {
    exporting.value = false
  }
}
function setFavorite(id: string, value: boolean) {
  workspace.setFavorite(id, value)
}
function moveToFolder(id: string, value: string) {
  workspace.moveToFolder(id, value)
}
function trashDocument(id: string) {
  if (editor.value?.hasPendingImages()) {
    notice.value = 'Wait for the image paste to finish before moving a document to Trash.'
    return
  }
  workspace.trash(id)
}
function restoreDocument(id: string) {
  workspace.restoreDocument(id)
}

function preference(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === 'true'
  } catch {
    return fallback
  }
}
const dark = ref(preference('alexopwriter-dark', true))
const vimEnabled = ref(preference('alexopwriter-vim', false))
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
watch(
  altDraft,
  () => {
    altRevision++
  },
  { flush: 'sync' },
)
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
  await Promise.all([
    captions.refresh(),
    services.inspectWritingFiles().then((files) => {
      if (request === inventoryRequest) writingFiles.value = files
    }),
  ])
}
function openSettings() {
  focusMode.value = false
  if (imageTarget.value) closeImage()
  panel.value = 'settings'
  void nextTick(() => panelHost.value?.focus())
  void refreshModels()
}
async function downloadCaption() {
  try {
    await captions.download()
  } catch (error) {
    reportError(error instanceof Error ? error : new Error('Image model download failed.'))
  }
}
async function removeCaption() {
  try {
    await captions.remove()
  } catch (error) {
    reportError(error instanceof Error ? error : new Error('Could not remove image model.'))
  }
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
      notice.value =
        'Your alt text changed while generating. Kept your edit; generate again if needed.'
      return
    }
    altDraft.value = text
    notice.value = 'Description drafted. Check details, especially text and charts, then apply.'
  } catch (error) {
    if (request === captionEpoch)
      reportError(error instanceof Error ? error : new Error('Could not describe image.'))
  }
}
function cancelGeneration() {
  captionEpoch++
  captions.cancel()
}
function closePanel() {
  if (imageTarget.value) closeImage()
  else {
    const settings = panel.value === 'settings'
    panel.value = null
    if (settings) settingsButton.value?.focus()
    else editor.value?.focus()
  }
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
  state.value.documents.find((document) => document.id === state.value.activeId),
)
const issues = computed(() => checkWriting(active.value?.text ?? ''))
const words = computed(() => imageAwareWordCount(active.value?.text ?? ''))
watch(
  () => state.value.activeId,
  () => {
    if (imageTarget.value) closeImage()
  },
)
const session = createSuggestionSession({
  workspace,
  assistant,
  editor: {
    captureSelection: () => editor.value?.captureSelection() ?? null,
    applyReplacement: (target, text) => editor.value?.applyReplacement(target, text) ?? false,
  },
  canSuggest: (text) => embeddedImages(text).length === 0,
})
const suggestion = shallowRef(session.snapshot())
releases.push(
  session.subscribe((snapshot) => {
    suggestion.value = snapshot
  }),
)
const displayNotice = computed(() => notice.value || suggestionNoticeText(suggestion.value.notice))
function dismissNotice() {
  notice.value = ''
  session.dismissNotice()
}
function reportError(error: Error) {
  notice.value = error instanceof Error ? error.message : 'The operation could not be completed.'
}
function beforeUnload(event: BeforeUnloadEvent) {
  const unsafe = state.value.documents.some(hasUnsecuredChanges)
  if (unsafe) {
    event.preventDefault()
    event.returnValue = ''
  }
}
function visibilityChanged() {
  if (document.visibilityState === 'hidden') void workspace.flush().catch(reportError)
}
function clearChord() {
  chord.value = false
  clearTimeout(chordTimer)
}
function escapeShortcut(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
  clearChord()
  if (document.querySelector('[role="dialog"]')) return
  if (panel.value) closePanel()
  else if (focusMode.value) {
    focusMode.value = false
    focusEditor()
  }
}
function shortcut(event: KeyboardEvent) {
  if (event.isComposing || event.defaultPrevented) return
  if (event.key === 'Escape') {
    clearChord()
    return
  }
  const stroke = shortcutStroke(event)
  if (!stroke) return
  if (document.querySelector('[role="dialog"]')) {
    clearChord()
    return
  }
  if (stroke === 'Mod+k') {
    event.preventDefault()
    clearChord()
    chord.value = true
    chordTimer = setTimeout(clearChord, 1500)
    return
  }
  const keys = chord.value ? `Mod+k ${stroke}` : stroke
  clearChord()
  const characterKey = characterShortcut(event)
  const command = commands.value.find(
    (item) => item.keys === keys || (characterKey !== null && item.characterKey === characterKey),
  )
  if (!command) return
  event.preventDefault()
  event.stopPropagation()
  if (!event.repeat) runCommand(command)
}
function runCommand(command: WriterCommand) {
  if (command.enabled === false) return
  try {
    void Promise.resolve(command.run()).catch(reportError)
  } catch (error) {
    reportError(error instanceof Error ? error : new Error('Command failed.'))
  }
}
function chooseCommand(command: WriterCommand) {
  pendingCommand = command
  commandsOpen.value = false
}
function paletteClosed() {
  const command = pendingCommand
  pendingCommand = undefined
  focusEditor()
  void nextTick(() => {
    if (command) runCommand(command)
  })
}
function navigate(mode: 'documents' | 'headings') {
  navigationMode.value = mode
  navigationOpen.value = true
}
function focusControl(label: string) {
  void nextTick(() => {
    const input = document.querySelector<HTMLElement>(`[aria-label="${label}"]`)
    input?.focus()
    if (input instanceof HTMLInputElement) input.select()
  })
}
function showLibrary(section = 'all', control?: string) {
  sidebar.value = true
  focusMode.value = false
  void nextTick(() => {
    library.value?.show(section)
    if (control) focusControl(control)
  })
}
const library = useTemplateRef<InstanceType<typeof DocumentList>>('library')
function commandTitle(id: string) {
  const command = commands.value.find((item) => item.id === id)
  return command
    ? `${command.label}${command.keys || command.characterKey ? ` (${commandShortcutLabel(command, mac)})` : ''}`
    : ''
}
function changePreference<K extends keyof WritingPreferences>(
  key: K,
  value: WritingPreferences[K],
) {
  writingPreferences.value = { ...writingPreferences.value, [key]: value }
}
const commands = computed<WriterCommand[]>(() => {
  const hasDocument = Boolean(active.value)
  const entries: WriterCommand[] = [
    {
      id: 'f1',
      label: 'Help: Show all commands',
      keys: 'f1',
      run: () => {
        commandsOpen.value = true
      },
    },
    {
      id: 'line',
      label: 'Go: Go to line',
      keys: 'Mod+g',
      enabled: hasDocument,
      run: () => {
        viewMode.value = 'write'
        void nextTick(() => editor.value?.goToLine())
      },
    },
    { id: 'undo', label: 'Edit: Undo', enabled: hasDocument, run: () => editor.value?.undo() },
    { id: 'redo', label: 'Edit: Redo', enabled: hasDocument, run: () => editor.value?.redo() },
    {
      id: 'enable-writing',
      label: 'Models: Enable local writing model (download if needed)',
      enabled: !['loading', 'running'].includes(assistantState.value.phase),
      run: enable,
    },
    {
      id: 'cancel-writing',
      label: 'Models: Cancel writing operation',
      enabled: ['loading', 'running'].includes(assistantState.value.phase),
      run: () => session.cancel(),
    },
    {
      id: 'remove-writing',
      label: 'Models: Remove local writing model',
      enabled: !['loading', 'running'].includes(assistantState.value.phase),
      run: removeModel,
    },
    {
      id: 'download-caption',
      label: 'Models: Download image description model (up to 240 MB)',
      enabled: !['loading', 'generating', 'removing'].includes(captionState.value.phase),
      run: downloadCaption,
    },
    {
      id: 'cancel-caption',
      label: 'Models: Cancel image model operation',
      run: () => captions.cancel(),
    },
    {
      id: 'remove-caption',
      label: 'Models: Remove image description model',
      enabled: !['loading', 'generating', 'removing'].includes(captionState.value.phase),
      run: removeCaption,
    },

    {
      id: 'commands',
      label: 'Help: Show command palette',
      keys: 'Mod+Shift+p',
      run: () => {
        commandsOpen.value = true
      },
    },
    {
      id: 'quick-open',
      label: 'Go: Quick open document',
      keys: 'Mod+p',
      run: () => navigate('documents'),
    },
    {
      id: 'headings',
      label: 'Go: Go to heading',
      keys: 'Mod+Shift+o',
      enabled: hasDocument,
      run: () => navigate('headings'),
    },
    {
      id: 'new',
      label: 'File: New document',
      keys: 'Mod+n',
      run: async () => {
        await workspace.create()
        viewMode.value = 'write'
        focusEditor()
      },
    },
    {
      id: 'open',
      label: 'File: Open file',
      keys: 'Mod+o',
      run: async () => {
        await workspace.open()
        focusEditor()
      },
    },
    { id: 'import', label: 'File: Import document', run: () => importer.value?.click() },
    {
      id: 'save',
      label: 'File: Save document',
      keys: 'Mod+s',
      enabled: hasDocument,
      run: () => active.value && workspace.save(active.value.id),
    },
    {
      id: 'download',
      label: 'File: Download Markdown copy',
      keys: 'Mod+Shift+s',
      enabled: hasDocument,
      run: download,
    },
    {
      id: 'rename',
      label: 'File: Rename document',
      keys: 'f2',
      enabled: hasDocument,
      run: () => {
        focusMode.value = false
        focusControl('Document name')
      },
    },
    {
      id: 'folder',
      label: 'File: Move document to folder',
      enabled: hasDocument,
      run: () => {
        showLibrary('all', 'Document folder')
      },
    },
    {
      id: 'favorite',
      label: 'File: Toggle favorite',
      enabled: hasDocument,
      run: () => {
        if (active.value) setFavorite(active.value.id, !active.value.favorite)
      },
    },
    {
      id: 'trash',
      label: 'File: Move document to Trash',
      enabled: hasDocument,
      run: () => {
        if (active.value) trashDocument(active.value.id)
      },
    },
    { id: 'sidebar', label: 'View: Toggle sidebar', keys: 'Mod+b', run: toggleDocuments },
    {
      id: 'explorer',
      label: 'View: Focus document explorer',
      keys: 'Mod+Shift+e',
      run: () => showLibrary(),
    },
    { id: 'favorites', label: 'View: Show favorites', run: () => showLibrary('favorites') },
    { id: 'trash-view', label: 'View: Show Trash', run: () => showLibrary('trash') },
    {
      id: 'editor',
      label: 'View: Focus editor',
      keys: 'Mod+1',
      run: () => {
        viewMode.value = 'write'
        focusEditor()
      },
    },
    {
      id: 'preview',
      label: 'Markdown: Toggle preview',
      keys: 'Mod+Shift+v',
      enabled: hasDocument,
      run: togglePreview,
    },
    {
      id: 'read',
      label: 'Markdown: Read only',
      enabled: hasDocument,
      run: () => {
        focusMode.value = false
        readOnly()
      },
    },
    { id: 'zen', label: 'View: Toggle Zen mode', keys: 'Mod+k z', run: toggleFocus },
    {
      id: 'theme',
      label: 'Preferences: Toggle dark theme',
      run: () => {
        dark.value = !dark.value
      },
    },
    {
      id: 'vim',
      label: 'Preferences: Toggle Vim mode',
      run: () => {
        vimEnabled.value = !vimEnabled.value
      },
    },
    { id: 'settings', label: 'Preferences: Open settings', keys: 'Mod+,', run: openSettings },
    {
      id: 'shortcuts',
      label: 'Help: Keyboard shortcuts',
      keys: 'Mod+k Mod+s',
      characterKey: '?',
      run: () => {
        shortcutsOpen.value = true
      },
    },
    {
      id: 'find',
      label: 'Edit: Find and replace',
      keys: 'Mod+f',
      enabled: hasDocument,
      run: findText,
    },
    {
      id: 'review',
      label: 'Review: Writing checks',
      keys: 'Mod+Shift+m',
      run: () => {
        focusMode.value = false
        panel.value = 'review'
        focusControl('Writing review')
      },
    },
    {
      id: 'assist',
      label: 'Review: Local writing help',
      run: () => {
        focusMode.value = false
        panel.value = 'assist'
        focusControl('Local writing help')
      },
    },
    {
      id: 'accept',
      label: 'Review: Accept suggestion',
      enabled: Boolean(suggestion.value.proposal),
      run: accept,
    },
    {
      id: 'discard',
      label: 'Review: Discard suggestion',
      enabled: Boolean(suggestion.value.proposal),
      run: () => session.discard(),
    },
    { id: 'models', label: 'Models: Manage downloads and local generation', run: openSettings },
    {
      id: 'typewriter',
      label: 'Preferences: Toggle typewriter scrolling',
      run: () => changePreference('typewriter', !writingPreferences.value.typewriter),
    },
    {
      id: 'spellcheck',
      label: 'Preferences: Toggle spelling',
      run: () => changePreference('spellcheck', !writingPreferences.value.spellcheck),
    },
    {
      id: 'dismiss',
      label: 'Notifications: Dismiss',
      enabled: Boolean(displayNotice.value),
      run: dismissNotice,
    },
    {
      id: 'update',
      label: 'App: Install available update',
      enabled: updateAvailable.value && workspaceReady.value && !updating.value,
      run: applyUpdate,
    },
  ]
  for (const format of ['html', 'docx', 'print'] as const)
    entries.push({
      id: `export-${format}`,
      label: `File: Export ${format === 'print' ? 'PDF / Print' : format.toUpperCase()}`,
      enabled: hasDocument && !exporting.value,
      run: () => exportDocument(format),
    })
  for (const action of ['shorten', 'clarify', 'heading'] as const)
    entries.push({
      id: action,
      label: `Review: ${action} selected passage`,
      enabled: selected.value && assistantState.value.phase === 'ready',
      run: () => suggest(action),
    })
  for (const doc of state.value.documents.filter((item) => item.trashedAt !== null))
    entries.push({
      id: `restore-${doc.id}`,
      label: `Trash: Restore ${doc.name}`,
      run: () => restoreDocument(doc.id),
    })
  for (const font of ['mono', 'serif', 'sans'] as const)
    entries.push({
      id: `font-${font}`,
      label: `Preferences: Typeface ${font}`,
      run: () => changePreference('font', font),
    })
  for (const width of ['narrow', 'medium', 'wide'] as const)
    entries.push({
      id: `width-${width}`,
      label: `Preferences: Line width ${width}`,
      run: () => changePreference('lineWidth', width),
    })
  for (const focus of ['off', 'sentence', 'paragraph'] as const)
    entries.push({
      id: `focus-${focus}`,
      label: `Preferences: Focus passage ${focus}`,
      run: () => changePreference('focus', focus),
    })
  for (const language of ['auto', 'en', 'en-US', 'en-GB', 'de', 'fr', 'es'] as const)
    entries.push({
      id: `language-${language}`,
      label: `Preferences: Spelling language ${language}`,
      run: () => changePreference('language', language),
    })
  for (let size = 14; size <= 28; size++)
    entries.push({
      id: `size-${size}`,
      label: `Preferences: Text size ${size}`,
      run: () => changePreference('fontSize', size),
    })
  for (const image of embeddedImages(active.value?.text ?? ''))
    entries.push({
      id: `image-${image.from}`,
      label: `Image: Edit alt text ${image.alt || 'Untitled image'} (${image.from})`,
      run: () => {
        viewMode.value = 'write'
        focusMode.value = false
        void nextTick(() => {
          const target = editor.value?.captureImage(image.from)
          if (target) openImage(target)
        })
      },
    })
  if (imageTarget.value)
    entries.push(
      { id: 'alt-apply', label: 'Image: Apply alt text', run: applyAlt },
      {
        id: 'alt-generate',
        label: 'Image: Generate alt text',
        enabled:
          captionState.value.files === 'available' && captionState.value.phase !== 'generating',
        run: generateAlt,
      },
      {
        id: 'alt-cancel',
        label: 'Image: Cancel generation',
        enabled: captionState.value.phase === 'generating',
        run: cancelGeneration,
      },
    )
  for (const issue of issues.value) {
    entries.push({
      id: `issue-${issue.id}`,
      label: `Review: Go to “${issue.text}” — ${issue.message}`,
      run: () => navigateHeading(issue.from, issue.to),
    })
    if (issue.replacement !== undefined)
      entries.push({
        id: `fix-${issue.id}`,
        label: `Review: Replace “${issue.text}” with “${issue.replacement}”`,
        run: () => applyIssue(issue.from, issue.to, issue.replacement ?? ''),
      })
  }
  return entries
})

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
    onNeedRefresh() {
      updateAvailable.value = true
    },
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
  window.addEventListener('keydown', shortcut, true)
  window.addEventListener('keydown', escapeShortcut)
  try {
    await workspace.initialize()
    if (!workspace.snapshot().documents.length) await workspace.create()
    workspaceReady.value = true
  } catch (error) {
    reportError(error instanceof Error ? error : new Error('Could not open workspace.'))
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  document.removeEventListener('visibilitychange', visibilityChanged)
  clearChord()
  window.removeEventListener('keydown', shortcut, true)
  window.removeEventListener('keydown', escapeShortcut)
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
  if (file)
    void file
      .text()
      .then((text) => workspace.importDocument({ name: file.name, text }))
      .catch(reportError)
  event.target.value = ''
}
function toggleDocuments() {
  sidebar.value = !sidebar.value
  focusMode.value = false
  if (!sidebar.value) focusEditor()
}
function activateDocument(id: string) {
  workspace.activate(id)
  if (window.matchMedia('(max-width: 760px)').matches) sidebar.value = false
  focusEditor()
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
    notice.value = error instanceof Error ? error.message : 'The model could not be loaded.'
  }
}
async function removeModel() {
  try {
    await assistant.remove()
    await refreshModels()
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'The model could not be removed.'
  }
}
</script>

<template>
  <div
    class="app-shell"
    :class="{ dark, focused: focusMode }"
    :style="writingStyle(writingPreferences)"
  >
    <header v-if="!focusMode" class="topbar">
      <div class="brand-group">
        <BaseButton
          size="icon"
          aria-label="Toggle documents"
          :title="commandTitle('sidebar')"
          :aria-expanded="sidebar && !focusMode"
          @click="toggleDocuments"
        >
          <PanelLeft :size="18" />
        </BaseButton>
        <span class="brand">alexopwriter</span>
        <BaseButton
          aria-label="Command palette"
          :title="shortcutLabel('Mod+Shift+p', mac)"
          @click="commandsOpen = true"
          >Commands</BaseButton
        >
        <BaseButton
          aria-label="Keyboard shortcuts"
          :title="commandTitle('shortcuts')"
          @click="shortcutsOpen = true"
          >?</BaseButton
        >
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
        <BaseButton
          aria-label="New document"
          :title="commandTitle('new')"
          @click="workspace.create()"
        >
          <Plus :size="15" /><span>New</span>
        </BaseButton>
        <BaseButton aria-label="Open file" :title="commandTitle('open')" @click="workspace.open()">
          <FolderOpen :size="15" /><span>Open</span>
        </BaseButton>
        <BaseButton
          :disabled="!active"
          aria-label="Save"
          :title="commandTitle('save')"
          @click="active && workspace.save(active.id)"
        >
          <Check :size="15" /><span>Save</span>
        </BaseButton>
        <BaseButton
          size="icon"
          aria-label="Download copy"
          :title="commandTitle('download')"
          :disabled="!active"
          @click="download"
        >
          <Download :size="16" />
        </BaseButton>
        <BaseButton
          size="icon"
          aria-label="Find and replace"
          :title="commandTitle('find')"
          :disabled="!active"
          @click="findText"
          ><Search :size="16"
        /></BaseButton>
        <BaseButton
          size="icon"
          aria-label="Quick navigation"
          :title="commandTitle('quick-open')"
          @click="navigate('documents')"
          ><Compass :size="16"
        /></BaseButton>
        <BaseButton
          size="icon"
          aria-label="Toggle preview"
          :title="commandTitle('preview')"
          :aria-pressed="viewMode !== 'write'"
          :disabled="!active"
          @click="togglePreview"
          ><BookOpen :size="16"
        /></BaseButton>
        <BaseButton
          size="icon"
          aria-label="Export document"
          title="Export document"
          :disabled="!active"
          @click="exportOpen = true"
          ><FileOutput :size="16"
        /></BaseButton>
        <span class="toolbar-divider" />
        <div class="page-tools">
          <BaseButton
            aria-label="Writing checks"
            :title="commandTitle('review')"
            :aria-expanded="panel === 'review'"
            @click="togglePanel('review')"
          >
            <SlidersHorizontal :size="14" />Review<span v-if="issues.length" class="count">{{
              issues.length
            }}</span></BaseButton
          ><BaseButton
            aria-label="Local writing help"
            :aria-expanded="panel === 'assist'"
            @click="togglePanel('assist')"
          >
            <Feather :size="14" /><span class="help-label">Writing help</span>
          </BaseButton>
        </div>
        <BaseButton
          ref="settingsButton"
          aria-label="Settings"
          :title="commandTitle('settings')"
          :aria-expanded="panel === 'settings'"
          @click="openSettings"
          >Settings</BaseButton
        >
        <span class="toolbar-divider" />
        <BaseButton size="icon" aria-label="Dark mode" :aria-pressed="dark" @click="dark = !dark">
          <Sun v-if="dark" :size="17" /><Moon v-else :size="17" />
        </BaseButton>
        <BaseButton
          size="icon"
          aria-label="Focus mode"
          :title="commandTitle('zen')"
          :aria-pressed="focusMode"
          @click="toggleFocus"
        >
          <Minimize v-if="focusMode" :size="17" /><Maximize v-else :size="17" />
        </BaseButton>
      </nav>
    </header>
    <div v-if="focusMode" class="focus-exit">
      <BaseButton
        aria-label="Focus mode"
        :title="commandTitle('zen')"
        :aria-pressed="true"
        @click="toggleFocus"
        >Exit focus</BaseButton
      >
    </div>
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
      <DocumentList
        ref="library"
        v-if="sidebar && !focusMode"
        :documents="state.documents"
        :active-id="state.activeId"
        @create="workspace.create()"
        @activate="activateDocument"
        @import="importer?.click()"
        @favorite="setFavorite"
        @folder="moveToFolder"
        @trash="trashDocument"
        @restore="restoreDocument"
      />
      <div class="document-workspace" :class="`view-${viewMode}`">
        <div v-if="viewMode !== 'write'" class="reading-tools" aria-label="Reading view">
          <BaseButton :aria-pressed="viewMode === 'split'" @click="viewMode = 'split'"
            >Side by side</BaseButton
          >
          <BaseButton :aria-pressed="viewMode === 'read'" @click="readOnly">Read only</BaseButton>
          <BaseButton @click="togglePreview">Close preview</BaseButton>
        </div>
        <div class="document-panes">
          <main v-show="viewMode !== 'read'" class="writing-area">
            <div v-if="active" class="page">
              <DocumentEditor
                ref="editor"
                :document-id="active.id"
                :text="active.text"
                :revision="active.revision"
                :vim-enabled="vimEnabled"
                :preferences="writingPreferences"
                :focus-enabled="focusMode"
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
          <section
            v-if="viewMode !== 'write' && active"
            ref="previewHost"
            class="preview-pane"
            aria-label="Document preview"
          >
            <DocumentPreview :text="active.text" :name="active.name" />
          </section>
        </div>
      </div>
      <aside
        v-if="!focusMode && (panel === 'image' || panel === 'settings')"
        ref="panelHost"
        tabindex="-1"
        class="review-panel"
        @keydown.esc.stop="closePanel"
        :aria-label="
          panel === 'settings'
            ? 'Settings'
            : panel === 'image'
              ? 'Image description'
              : panel === 'review'
                ? 'Writing review'
                : 'Local writing help'
        "
      >
        <div class="panel-header">
          <h2>
            {{
              panel === 'settings'
                ? 'Settings'
                : panel === 'image'
                  ? 'Image description'
                  : panel === 'review'
                    ? 'Writing review'
                    : 'Writing help'
            }}
          </h2>
          <BaseButton size="icon" aria-label="Close panel" @click="closePanel">
            <X :size="17" />
          </BaseButton>
        </div>
        <template v-if="panel === 'settings'">
          <WritingSettings v-model="writingPreferences" />
          <BaseButton aria-label="Keyboard shortcuts" @click="shortcutsOpen = true"
            >Keyboard shortcuts <kbd>?</kbd></BaseButton
          >
          <h3 class="settings-model-heading">Local models</h3>
          <ModelSettings
            :caption="captionState"
            :writing="assistantState"
            :writing-files="writingFiles"
            @download-caption="downloadCaption"
            @cancel-caption="captions.cancel()"
            @remove-caption="removeCaption"
            @enable-writing="enable"
            @cancel-writing="session.cancel()"
            @remove-writing="removeModel"
          />
        </template>
        <template v-else-if="panel === 'image' && imageTarget">
          <section class="image-description" @keydown.esc.stop="closeImage">
            <img :src="imageTarget.url" :alt="imageTarget.alt" class="alt-preview" />
            <p class="panel-description">
              Describe what matters about this image in your document.
            </p>
            <label for="image-alt">Alt text</label>
            <BaseTextarea id="image-alt" ref="altInput" v-model="altDraft" rows="5" />
            <p class="panel-description">Leave empty for a decorative image.</p>
            <template v-if="captionState.phase === 'generating'">
              <p role="status">{{ captionState.message }}</p>
              <BaseButton @click="cancelGeneration">Cancel generation</BaseButton>
            </template>
            <BaseButton v-else-if="captionState.files === 'available'" @click="generateAlt"
              >Generate alt text</BaseButton
            >
            <BaseButton v-else @click="openSettings">Set up local generation</BaseButton>
            <p class="panel-description">
              Generated descriptions are in English. Check details, especially text and charts.
            </p>
            <div class="proposal-actions">
              <BaseButton variant="primary" @click="applyAlt">Apply alt text</BaseButton>
              <BaseButton @click="closeImage">Cancel</BaseButton>
            </div>
          </section>
        </template>
      </aside>
      <AssistancePanel
        v-if="!focusMode && (panel === 'review' || panel === 'assist')"
        :panel="panel"
        :issues="issues"
        :assistant-state="assistantState"
        :selected="selected"
        :proposal="suggestion.proposal"
        @close="closePanel"
        @settings="openSettings"
        @select-range="(from, to) => editor?.selectRange(from, to)"
        @apply-issue="applyIssue"
        @accept="accept"
        @discard="session.discard()"
        @suggest="suggest"
      />
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
    <CommandPalette
      v-model:open="commandsOpen"
      :commands="commands"
      @execute="chooseCommand"
      @closed="paletteClosed"
    />
    <QuickNavigation
      v-model:open="navigationOpen"
      :mode="navigationMode"
      :documents="state.documents"
      :text="active?.text ?? ''"
      @document="activateDocument"
      @heading="navigateHeading"
      @closed="focusEditor"
    />
    <BaseDialog v-model:open="shortcutsOpen" title="Keyboard shortcuts" @closed="focusEditor">
      <p class="panel-description">
        Press ? outside text fields, or {{ shortcutLabel('Mod+k Mod+s', mac) }} while typing. Search
        ? in the command palette to open this reference. Open the command palette for every app
        action.
      </p>
      <dl class="shortcut-list">
        <template
          v-for="shortcutItem in commands.filter((item) => item.keys || item.characterKey)"
          :key="shortcutItem.id"
          ><dt>{{ shortcutItem.label }}</dt>
          <dd>{{ commandShortcutLabel(shortcutItem, mac) }}</dd></template
        >
      </dl>
      <h3>Text editing</h3>
      <dl class="shortcut-list">
        <dt>Undo</dt>
        <dd>{{ shortcutLabel('Mod+z', mac) }}</dd>
        <dt>Redo</dt>
        <dd>
          {{ shortcutLabel('Mod+Shift+z', mac) }}<template v-if="!mac"> or Ctrl + y</template>
        </dd>
        <dt>Select all</dt>
        <dd>{{ shortcutLabel('Mod+a', mac) }}</dd>
        <dt>Extend selection</dt>
        <dd>Shift + Arrow keys</dd>
        <dt>Copy / cut / paste</dt>
        <dd>{{ shortcutLabel('Mod+c / Mod+x / Mod+v', mac) }}</dd>
        <dt>Find next / previous</dt>
        <dd>F3 / Shift + F3</dd>
      </dl>
      <h3>Navigation and dialogs</h3>
      <dl class="shortcut-list">
        <dt>Next / previous control</dt>
        <dd>Tab / Shift + Tab</dd>
        <dt>Activate control</dt>
        <dd>Enter or Space</dd>
        <dt>Navigate command and quick-open results</dt>
        <dd>↑ / ↓, then Enter</dd>
        <dt>Close dialog or panel / exit Zen mode / cancel chord</dt>
        <dd>Escape</dd>
      </dl>
      <p class="panel-description">
        Vim mode uses its own editor bindings. This reference lists app shortcuts and common text
        controls.
      </p>
    </BaseDialog>
    <BaseDialog v-model:open="exportOpen" title="Export document" @closed="focusEditor">
      <div class="export-actions">
        <BaseButton :disabled="exporting" variant="outline" @click="exportDocument('html')"
          >Download HTML</BaseButton
        >
        <BaseButton :disabled="exporting" variant="outline" @click="exportDocument('docx')"
          >Download Word document</BaseButton
        >
        <BaseButton :disabled="exporting" variant="outline" @click="exportDocument('print')"
          >Print / Save PDF</BaseButton
        >
      </div>
      <p class="panel-description">PDF uses your browser's print dialog. Choose Save as PDF.</p>
    </BaseDialog>
    <div v-if="chord" class="app-notice" role="status">
      Waiting for second key… Z: Zen mode · {{ mac ? '⌘' : 'Ctrl' }} + S: Shortcuts · Esc: Cancel
    </div>
    <footer v-if="!focusMode" class="statusbar">
      <div>
        <BaseButton
          aria-label="Vim mode"
          :aria-pressed="vimEnabled"
          class="mode-button"
          @click="vimEnabled = !vimEnabled"
        >
          {{ mode }}</BaseButton
        ><span>{{ words.toLocaleString() }} words</span><span class="status-separator">/</span
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
