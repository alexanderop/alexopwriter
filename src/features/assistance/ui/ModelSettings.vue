<script setup lang="ts">
import { BaseButton } from '../../../shared/ui/button'
import type { AssistantState } from '../domain/assistant'
import type { CaptionState } from '../domain/imageCaption'
import { CAPTION_MODEL, type ModelFiles } from '../domain/modelFiles'
import { MODEL_INFO } from '../domain/modelInfo'
defineProps<{ caption: CaptionState; writing: AssistantState; writingFiles: ModelFiles }>()
defineEmits<{
  'download-caption': []
  'cancel-caption': []
  'remove-caption': []
  'enable-writing': []
  'cancel-writing': []
  'remove-writing': []
}>()
function availability(files: ModelFiles) {
  return { available: 'Downloaded in this browser', partial: 'Download incomplete', absent: 'Not downloaded', unknown: 'Download status unavailable' }[files]
}
</script>
<template>
  <p class="panel-description">Models download from Hugging Face. Your text and images are processed in this browser.</p>
  <section class="model-card" aria-label="Image description model">
    <span class="eyebrow">IMAGE DESCRIPTIONS · ENGLISH</span>
    <h3>{{ CAPTION_MODEL.name }}</h3>
    <p>Generate an editable alt-text draft. Check details, especially text and charts.</p>
    <p>Up to 240 MB download. Stored in this browser.</p>
    <p>{{ availability(caption.files) }}</p>
    <p v-if="caption.phase !== 'idle'" role="status">{{ caption.message }}</p>
    <template v-if="caption.phase === 'loading' || caption.phase === 'generating'">
      <progress aria-label="Image model progress" />
      <BaseButton @click="$emit('cancel-caption')">Cancel image model</BaseButton>
    </template>
    <template v-else-if="caption.phase !== 'removing'">
      <BaseButton v-if="caption.files !== 'available'" variant="primary" @click="$emit('download-caption')">{{ caption.phase === 'error' || caption.files === 'partial' ? 'Retry image model download' : 'Download image model' }}</BaseButton>
      <p v-else-if="caption.phase !== 'ready'" class="panel-description">Available. Loads when you generate a description.</p>
      <BaseButton v-if="caption.phase === 'ready'" @click="$emit('cancel-caption')">Unload image model</BaseButton>
      <BaseButton v-if="caption.files !== 'absent'" variant="text" @click="$emit('remove-caption')">Remove image model files</BaseButton>
    </template>
  </section>
  <section class="model-card" aria-label="Writing help model">
    <span class="eyebrow">WRITING HELP · ENGLISH</span>
    <h3>{{ MODEL_INFO.name }}</h3>
    <p>Shorten passages, clarify wording and suggest headings.</p>
    <p>{{ MODEL_INFO.downloadLabel }} download. Review suggestions before applying.</p>
    <p>{{ availability(writingFiles) }}</p>
    <p role="status">{{ writing.message }}</p>
    <template v-if="writing.phase === 'loading' || writing.phase === 'running'">
      <progress :value="writing.progress" max="100" aria-label="Model progress" />
      <BaseButton @click="$emit('cancel-writing')">Cancel writing model</BaseButton>
    </template>
    <template v-else>
      <BaseButton v-if="writing.phase !== 'ready'" variant="primary" @click="$emit('enable-writing')">{{ writingFiles === 'available' ? 'Enable writing model' : 'Download & enable' }}</BaseButton>
      <p v-else class="ready-state">Ready on this device</p>
      <BaseButton variant="text" class="remove-model" @click="$emit('remove-writing')">Remove downloaded model</BaseButton>
    </template>
  </section>
  <p class="panel-description">Writing checks work without a model. Removing model files does not change your documents or saved alt text.</p>
</template>
