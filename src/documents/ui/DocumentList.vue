<script setup lang="ts">
import { Plus, FileText, FolderOpen } from '@lucide/vue'
import type { DocumentSnapshot } from '../domain/document'
defineProps<{ documents: readonly DocumentSnapshot[]; activeId: string | null }>()
const emit = defineEmits<{ create: []; activate: [id: string]; import: [] }>()
</script>
<template>
      <aside
        class="documents"
        aria-label="Documents"
      >
        <div class="section-heading">
          <span>Documents</span
          ><button
            class="icon-button"
            aria-label="Create document"
            @click="emit('create')"
          >
            <Plus :size="15" />
          </button>
        </div>
        <div class="document-list">
          <button
            v-for="document in documents"
            :key="document.id"
            class="document-item"
            :class="{ active: document.id === activeId }"
            :aria-current="document.id === activeId ? 'page' : undefined"
            @click="emit('activate', document.id)"
          >
            <FileText :size="15" /><span>{{ document.name }}</span
            ><span v-if="document.id === activeId" class="active-dot" />
          </button>
        </div>
        <button class="import-action" @click="emit('import')">
          <FolderOpen :size="15" />Import file
        </button>
        <div class="local-note">
          <span class="local-dot" />On your device
          <p>
            Drafts stay in this browser.<br />Save a copy to keep them on disk.
          </p>
        </div>
      </aside>
</template>
