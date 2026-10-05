<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { BaseDialog } from '../shared/ui/dialog'
import { BaseInput } from '../shared/ui/input'
import { BaseButton } from '../shared/ui/button'
import { commandShortcutLabel, type WriterCommand } from './shortcuts'
const props = defineProps<{ commands: readonly WriterCommand[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ execute: [command: WriterCommand]; closed: [] }>()
const query = ref('')
const selected = ref(0)
const search = useTemplateRef<InstanceType<typeof BaseInput>>('search')
const results = useTemplateRef<HTMLElement>('results')
const mac = navigator.platform.includes('Mac')
const matches = computed(() => {
  const search = query.value.toLowerCase().replace(/^>/, '').trim()
  if (search === '?') return props.commands.filter((command) => command.characterKey === '?')
  const terms = search.split(/\s+/)
  return props.commands.filter((command) =>
    terms.every((term) => command.label.toLowerCase().includes(term)),
  )
})
watch([query, open], () => {
  selected.value = 0
})
watch(open, (value) => {
  if (value) query.value = ''
})
function opened(event: Event) {
  event.preventDefault()
  void nextTick(() => search.value?.focus())
}
function move(direction: number) {
  selected.value = (selected.value + direction + matches.value.length) % (matches.value.length || 1)
  void nextTick(() => results.value?.children[selected.value]?.scrollIntoView({ block: 'nearest' }))
}
function choose(command = matches.value[selected.value]) {
  if (command && command.enabled !== false) emit('execute', command)
}
function chooseSelected() {
  choose()
}
</script>
<template>
  <BaseDialog v-model:open="open" title="Command palette" @opened="opened" @closed="emit('closed')">
    <BaseInput
      ref="search"
      v-model="query"
      aria-label="Search commands"
      placeholder="Type a command…"
      class="command-search"
      role="combobox"
      aria-expanded="true"
      aria-controls="command-results"
      aria-autocomplete="list"
      :aria-activedescendant="matches.length ? `command-${selected}` : undefined"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="chooseSelected"
    />
    <p class="command-hint">↑ ↓ to navigate · Enter to run · Esc to close · ? for shortcuts</p>
    <div
      id="command-results"
      ref="results"
      role="listbox"
      aria-label="Commands"
      class="command-results"
    >
      <BaseButton
        v-for="(command, index) in matches"
        :id="`command-${index}`"
        :key="command.id"
        role="option"
        :aria-selected="selected === index"
        :aria-disabled="command.enabled === false"
        tabindex="-1"
        :variant="selected === index ? 'soft' : 'ghost'"
        class="command-entry"
        @click="choose(command)"
      >
        <span>{{ command.label }}</span
        ><kbd v-if="command.keys || command.characterKey">{{
          commandShortcutLabel(command, mac)
        }}</kbd>
      </BaseButton>
    </div>
    <p v-if="!matches.length" role="status">No matching commands.</p>
  </BaseDialog>
</template>
<style scoped>
.command-search {
  width: 100%;
}
.command-hint {
  color: var(--muted);
  font-size: 12px;
  margin-block: 10px;
}
.command-results {
  max-height: 48vh;
  overflow-y: auto;
}
.command-entry {
  width: 100%;
  justify-content: space-between;
  text-align: left;
  gap: 1rem;
  height: auto;
}
.command-entry[aria-disabled='true'] {
  opacity: 0.45;
}
kbd {
  white-space: nowrap;
  color: inherit;
  font-size: 11px;
}
</style>
