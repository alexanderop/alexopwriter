<script setup lang="ts">
import { Primitive } from 'reka-ui'
import { useTemplateRef } from 'vue'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './styles'

withDefaults(
  defineProps<{
    variant?: ButtonVariant
    size?: ButtonSize
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
  }>(),
  { variant: 'ghost', size: 'sm', type: 'button', disabled: false },
)

const button = useTemplateRef<InstanceType<typeof Primitive>>('button')
defineExpose({ focus: () => button.value?.$el?.focus() })
</script>

<template>
  <Primitive
    ref="button"
    as="button"
    :type="type"
    :disabled="disabled"
    :class="buttonClasses(variant, size)"
    data-ui="button"
    :data-variant="variant"
    :data-size="size"
  >
    <slot />
  </Primitive>
</template>
