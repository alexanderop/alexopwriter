<script setup lang="ts">
import { useTemplateRef } from 'vue'
const model = defineModel<string>({ default: '' })
const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')
defineExpose({ focus: () => textarea.value?.focus() })
</script>

<template>
  <textarea
    ref="textarea"
    v-model="model"
    data-ui="textarea"
    class="w-full resize-y rounded-control border border-solid border-line bg-paper p-3 font-system text-sm leading-relaxed text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
  />
</template>
