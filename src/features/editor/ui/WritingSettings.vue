<script setup lang="ts">
import { BaseSelect } from '../../../shared/ui/select'
import { BaseButton } from '../../../shared/ui/button'
import { parseWritingPreferences, type WritingPreferences } from '../domain/preferences'
const preferences = defineModel<WritingPreferences>({ required: true })
function update(key: keyof WritingPreferences, value: unknown) {
  preferences.value = parseWritingPreferences({ ...preferences.value, [key]: value })
}
function updateFont(value: string | undefined) {
  update('font', value)
}
function updateSize(value: string | undefined) {
  update('fontSize', Number(value))
}
function updateWidth(value: string | undefined) {
  update('lineWidth', value)
}
function updateFocus(value: string | undefined) {
  update('focus', value)
}
function updateLanguage(value: string | undefined) {
  update('language', value)
}
function toggleTypewriter() {
  update('typewriter', !preferences.value.typewriter)
}
function toggleSpelling() {
  update('spellcheck', !preferences.value.spellcheck)
}
</script>
<template>
  <section class="writing-settings" aria-label="Writing preferences">
    <label
      >Typeface<BaseSelect :model-value="preferences.font" @update:model-value="updateFont"
        ><option value="mono">Monospace</option>
        <option value="serif">Serif</option>
        <option value="sans">Sans serif</option></BaseSelect
      ></label
    >
    <label
      >Text size<BaseSelect
        :model-value="String(preferences.fontSize)"
        @update:model-value="updateSize"
        ><option v-for="size in 15" :key="size" :value="String(size + 13)">
          {{ size + 13 }} px
        </option></BaseSelect
      ></label
    >
    <label
      >Line width<BaseSelect :model-value="preferences.lineWidth" @update:model-value="updateWidth"
        ><option value="narrow">Narrow</option>
        <option value="medium">Medium</option>
        <option value="wide">Wide</option></BaseSelect
      ></label
    >
    <label
      >Focus passage<BaseSelect :model-value="preferences.focus" @update:model-value="updateFocus"
        ><option value="off">No dimming</option>
        <option value="sentence">Sentence</option>
        <option value="paragraph">Paragraph</option></BaseSelect
      ></label
    >
    <BaseButton
      :variant="preferences.typewriter ? 'primary' : 'outline'"
      :aria-pressed="preferences.typewriter"
      @click="toggleTypewriter"
      >Typewriter scrolling</BaseButton
    >
    <BaseButton
      :variant="preferences.spellcheck ? 'primary' : 'outline'"
      :aria-pressed="preferences.spellcheck"
      @click="toggleSpelling"
      >Check spelling</BaseButton
    >
    <label
      >Spelling language<BaseSelect
        :model-value="preferences.language"
        @update:model-value="updateLanguage"
        ><option value="auto">Browser language</option>
        <option value="en">English</option>
        <option value="en-US">English (US)</option>
        <option value="en-GB">English (UK)</option>
        <option value="de">Deutsch</option>
        <option value="fr">Français</option>
        <option value="es">Español</option></BaseSelect
      ></label
    >
    <p>Spelling suggestions use the dictionaries available in your browser.</p>
  </section>
</template>
<style scoped>
.writing-settings {
  display: grid;
  gap: 12px;
}
label {
  display: grid;
  gap: 5px;
}
p {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
</style>
