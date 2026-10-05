<script setup lang="ts">
import { computed, nextTick, ref, watch, useTemplateRef } from 'vue'
import { BaseButton } from '../../../shared/ui/button'
import { BaseInput } from '../../../shared/ui/input'
import { BaseSelect } from '../../../shared/ui/select'
import { Plus, FileText, FolderOpen, Star, Trash2 } from '@lucide/vue'
import type { DocumentSnapshot } from '../domain/document'
import { selectLibrary } from '../domain/library'
const props = defineProps<{ documents: readonly DocumentSnapshot[]; activeId: string | null }>()
const emit = defineEmits<{
  create: []
  activate: [id: string]
  import: []
  favorite: [id: string, value: boolean]
  folder: [id: string, value: string]
  trash: [id: string]
  restore: [id: string]
}>()
const searchInput = useTemplateRef<InstanceType<typeof BaseInput>>('searchInput')
defineExpose({
  show: (value: string) => {
    section.value = value
    query.value = ''
    void nextTick(() => searchInput.value?.focus())
  },
})
const query = ref('')
const section = ref('all')
const sort = ref('updated')
const folders = computed(() =>
  [
    ...new Set(
      props.documents
        .filter((doc) => doc.trashedAt === null)
        .map((doc) => doc.folder)
        .filter(Boolean),
    ),
  ].sort(),
)
watch(folders, (names) => {
  if (section.value.startsWith('folder:') && !names.includes(section.value.slice(7)))
    section.value = 'all'
})
const visible = computed(() =>
  selectLibrary(props.documents, {
    query: query.value,
    section:
      section.value === 'trash' ? 'trash' : section.value === 'favorites' ? 'favorites' : 'all',
    ...(section.value.startsWith('folder:') ? { folder: section.value.slice(7) } : {}),
    sort: sort.value === 'name' ? 'name' : 'updated',
  }),
)
function assignFolder(id: string, event: Event) {
  if (event.target instanceof HTMLInputElement) emit('folder', id, event.target.value)
}
</script>
<template>
  <aside class="documents" aria-label="Documents">
    <div class="section-heading">
      <span>Documents</span>
      <BaseButton size="icon" aria-label="Create document" @click="emit('create')"
        ><Plus :size="15"
      /></BaseButton>
    </div>
    <BaseInput
      ref="searchInput"
      v-model="query"
      type="search"
      aria-label="Search documents"
      placeholder="Search documents"
    />
    <div class="library-filters">
      <BaseSelect v-model="section" aria-label="Document collection">
        <option value="all">All documents</option>
        <option value="favorites">Favorites</option>
        <option value="trash">Trash</option>
        <option v-for="folder in folders" :key="folder" :value="`folder:${folder}`">
          {{ folder }}
        </option>
      </BaseSelect>
      <BaseSelect v-model="sort" aria-label="Sort documents"
        ><option value="updated">Recent</option>
        <option value="name">Name</option></BaseSelect
      >
    </div>
    <div class="document-list">
      <div v-for="document in visible" :key="document.id" class="library-document">
        <BaseButton
          v-if="document.trashedAt === null"
          class="document-item"
          :variant="document.id === activeId ? 'soft' : 'ghost'"
          :aria-current="document.id === activeId ? 'page' : undefined"
          @click="emit('activate', document.id)"
        >
          <FileText :size="15" /><span>{{ document.name }}</span
          ><Star v-if="document.favorite" :size="12" aria-hidden="true" />
        </BaseButton>
        <span v-else class="trash-name">{{ document.name }}</span>
        <div
          v-if="document.id === activeId || document.trashedAt !== null"
          class="document-actions"
        >
          <template v-if="document.trashedAt === null">
            <BaseButton
              size="icon"
              :aria-label="document.favorite ? 'Remove favorite' : 'Add favorite'"
              :aria-pressed="document.favorite"
              @click="emit('favorite', document.id, !document.favorite)"
              ><Star :size="14"
            /></BaseButton>
            <BaseButton size="icon" aria-label="Move to Trash" @click="emit('trash', document.id)"
              ><Trash2 :size="14"
            /></BaseButton>
            <BaseInput
              :model-value="document.folder"
              aria-label="Document folder"
              placeholder="Folder"
              list="document-folders"
              @change="assignFolder(document.id, $event)"
            />
          </template>
          <BaseButton v-else @click="emit('restore', document.id)">Restore</BaseButton>
        </div>
      </div>
      <p v-if="!visible.length" class="empty-library">
        {{ section === 'trash' ? 'Trash is empty.' : 'No documents found.' }}
      </p>
    </div>
    <datalist id="document-folders">
      <option v-for="folder in folders" :key="folder" :value="folder" />
    </datalist>
    <BaseButton class="import-action" @click="emit('import')"
      ><FolderOpen :size="15" />Import file</BaseButton
    >
    <div class="local-note">
      <span class="local-dot" />On your device
      <p>Drafts stay in this browser.<br />Save a copy to keep them on disk.</p>
    </div>
  </aside>
</template>
<style scoped>
.library-filters {
  display: flex;
  gap: 4px;
  margin-block: 8px;
}
.library-filters select {
  flex: 1;
  width: 0;
}
.library-document {
  min-width: 0;
}
.document-actions {
  display: flex;
  align-items: center;
  gap: 3px;
  margin: 3px 4px 9px;
}
.document-actions input {
  flex: 1;
  width: 0;
}
.trash-name {
  display: block;
  padding: 8px;
  overflow-wrap: anywhere;
}
.empty-library {
  padding: 8px;
  font-size: 12px;
  color: var(--muted);
}
</style>
