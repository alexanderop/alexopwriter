<script setup lang="ts">
import { useTemplateRef } from 'vue'
const model = defineModel<string>()
const select = useTemplateRef<HTMLSelectElement>('select')
defineExpose({ focus: () => select.value?.focus() })
</script>

<template>
  <select
    ref="select"
    v-model="model"
    data-ui="select"
    class="min-h-8 min-w-0 rounded-control border border-solid border-line bg-paper px-2 py-1.5 font-system text-xs leading-normal text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
  >
    <slot />
  </select>
</template>
