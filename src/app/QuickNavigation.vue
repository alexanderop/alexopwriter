<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { BaseDialog } from '../shared/ui/dialog'
import { BaseInput } from '../shared/ui/input'
import { BaseButton } from '../shared/ui/button'
import type { DocumentSnapshot } from '../features/documents'
import { renderDocument } from '../features/reading'
const props = defineProps<{
  documents: readonly DocumentSnapshot[]
  text: string
  mode?: 'documents' | 'headings'
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  document: [id: string]
  heading: [from: number, to: number]
  closed: []
}>()
const query = ref('')
const search = useTemplateRef<InstanceType<typeof BaseInput>>('search')
function opened(event: Event) {
  event.preventDefault()
  void nextTick(() => search.value?.focus())
}
const tab = ref<'documents' | 'headings'>('documents')
const resultsHost = useTemplateRef<HTMLDivElement>('results')
watch(open, (value) => {
  if (value) {
    query.value = ''
    tab.value = props.mode ?? 'documents'
  }
})
const entries = computed(() => {
  if (!open.value) return []
  const needle = query.value.trim().toLocaleLowerCase()
  if (tab.value === 'headings')
    return renderDocument(props.text)
      .headings.filter((heading) => heading.text.toLocaleLowerCase().includes(needle))
      .map((heading) => ({
        key: heading.id,
        label: heading.text,
        detail: `Heading ${heading.level}`,
        from: heading.from,
        to: heading.to,
        documentId: null,
      }))
  return props.documents
    .filter(
      (document) =>
        document.trashedAt === null &&
        `${document.name}\n${document.text}`.toLocaleLowerCase().includes(needle),
    )
    .map((document) => ({
      key: document.id,
      label: document.name,
      detail: document.folder || 'Documents',
      from: 0,
      to: 0,
      documentId: document.id,
    }))
})
function choose(index: number) {
  const entry = entries.value[index]
  if (!entry) return
  open.value = false
  if (entry.documentId !== null) emit('document', entry.documentId)
  else emit('heading', entry.from, entry.to)
}
function firstResult() {
  resultsHost.value?.querySelector('button')?.focus()
}
function moveResult(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const buttons = Array.from(resultsHost.value?.querySelectorAll('button') ?? [])
  const index = buttons.findIndex((button) => button === document.activeElement)
  if (index < 0 || !buttons.length) return
  event.preventDefault()
  buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
}
</script>
<template>
  <BaseDialog
    v-model:open="open"
    title="Quick navigation"
    @opened="opened"
    @closed="emit('closed')"
  >
    <div class="navigation-tabs">
      <BaseButton :aria-pressed="tab === 'documents'" @click="tab = 'documents'"
        >Documents</BaseButton
      >
      <BaseButton :aria-pressed="tab === 'headings'" @click="tab = 'headings'">Headings</BaseButton>
    </div>
    <BaseInput
      ref="search"
      v-model="query"
      class="navigation-search"
      aria-label="Search documents or headings"
      placeholder="Search…"
      @keydown.down.prevent="firstResult"
      @keydown.enter.prevent="choose(0)"
    />
    <div ref="results" class="navigation-results" @keydown="moveResult">
      <BaseButton
        v-for="(entry, index) in entries"
        :key="entry.key"
        class="navigation-entry"
        @click="choose(index)"
      >
        <span>{{ entry.label }}</span
        ><small>{{ entry.detail }}</small>
      </BaseButton>
      <p v-if="!entries.length" class="navigation-empty">
        {{ tab === 'headings' ? 'No matching headings.' : 'No matching documents.' }}
      </p>
    </div>
  </BaseDialog>
</template>
<style scoped>
.navigation-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.navigation-search {
  width: 100%;
}
.navigation-results {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.75rem;
}
.navigation-entry {
  justify-content: space-between;
  text-align: left;
  height: auto;
}
.navigation-entry span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.navigation-entry small,
.navigation-empty {
  color: var(--muted);
}
</style>
