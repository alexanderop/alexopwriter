<script setup lang="ts">
import { useTemplateRef } from 'vue'
withDefaults(defineProps<{ variant?: 'outline' | 'ghost' }>(), { variant: 'outline' })
const model = defineModel<string>()
const input = useTemplateRef<HTMLInputElement>('input')
defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <input
    ref="input"
    v-model="model"
    data-ui="input"
    :data-variant="variant"
    class="min-h-8 min-w-0 rounded-control border border-solid px-2 py-1.5 font-system text-xs leading-normal text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
    :class="
      variant === 'ghost'
        ? 'border-transparent bg-transparent hover:bg-hover'
        : 'border-line bg-paper'
    "
  />
</template>
