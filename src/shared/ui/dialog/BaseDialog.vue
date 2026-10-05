<script setup lang="ts">
import { DialogRoot, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui'
import { BaseButton } from '../button'
defineProps<{ title: string; description?: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ closed: []; opened: [event: Event] }>()
function closed(event: Event) {
  event.preventDefault()
  emit('closed')
}
</script>
<template>
  <DialogRoot v-model:open="open">
    <DialogOverlay class="dialog-overlay" />
    <DialogContent
      class="dialog-content"
      :aria-describedby="undefined"
      @close-auto-focus="closed"
      @open-auto-focus="emit('opened', $event)"
    >
      <div class="dialog-heading">
        <DialogTitle>{{ title }}</DialogTitle>
        <BaseButton aria-label="Close dialog" @click="open = false">Close</BaseButton>
      </div>
      <DialogDescription v-if="description">{{ description }}</DialogDescription>
      <slot />
    </DialogContent>
  </DialogRoot>
</template>
<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: var(--shadow-overlay);
}
.dialog-content {
  position: fixed;
  top: 12vh;
  left: 50%;
  transform: translateX(-50%);
  z-index: 21;
  width: min(36rem, calc(100vw - 2rem));
  max-height: 76dvh;
  overflow-y: auto;
  padding: 1.25rem;
  background: var(--paper);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  font-family: var(--font-system);
  box-shadow: 0 12px 40px var(--shadow-notice);
}
.dialog-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
.dialog-heading :deep(h2) {
  font-size: 1rem;
  margin: 0;
}
</style>
