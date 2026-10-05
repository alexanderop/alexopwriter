<script setup lang="ts">
import { computed } from 'vue'
import { renderDocument } from '../domain/markdown'

defineOptions({ inheritAttrs: true })
const props = defineProps<{ text: string; name?: string }>()
const html = computed(() => renderDocument(props.text).html)
</script>

<template>
  <article
    class="document-preview reading-content"
    :aria-label="name ? `Preview of ${name}` : 'Document preview'"
    tabindex="0"
    v-html="html"
  />
</template>

<style scoped>
.document-preview {
  padding: clamp(1rem, 4vw, 3rem);
  max-width: 76ch;
  margin-inline: auto;
  width: 100%;
  box-sizing: border-box;
  color: var(--ink);
  overflow-wrap: anywhere;
  line-height: 1.75;
  font-family: Georgia, serif;
  font-size: 1.1rem;
}
.document-preview:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.document-preview :deep(h1),
.document-preview :deep(h2),
.document-preview :deep(h3),
.document-preview :deep(h4),
.document-preview :deep(h5),
.document-preview :deep(h6) {
  line-height: 1.3;
  margin: 1.5em 0 0.6em;
}
.document-preview :deep(> :first-child) {
  margin-top: 0;
}
.document-preview :deep(img) {
  max-width: 100%;
  height: auto;
}
.document-preview :deep(pre) {
  overflow-x: auto;
  padding: 1em;
  background: var(--panel);
  border-radius: var(--radius-control);
}
.document-preview :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
}
.document-preview :deep(blockquote) {
  border-inline-start: 3px solid var(--line);
  margin-inline: 0;
  padding-inline-start: 1em;
  color: var(--muted);
}
.document-preview :deep(table) {
  border-collapse: collapse;
  display: block;
  max-width: 100%;
  overflow-x: auto;
}
.document-preview :deep(th),
.document-preview :deep(td) {
  border: 1px solid var(--line);
  padding: 0.45em 0.8em;
}
.document-preview :deep(a) {
  color: var(--accent);
  text-decoration: underline;
}
.document-preview :deep(hr) {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 2em 0;
}
.document-preview :deep(.reading-image-placeholder) {
  color: var(--muted);
  font-style: italic;
}
</style>
