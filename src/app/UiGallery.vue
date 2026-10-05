<script setup lang="ts">
import { ref } from 'vue'
import { Plus } from '@lucide/vue'
import { BaseButton, buttonVariants, type ButtonVariant } from '../shared/ui/button'
import { BaseInput } from '../shared/ui/input'
import { BaseTextarea } from '../shared/ui/textarea'
import { BaseSelect } from '../shared/ui/select'
import { BaseDialog } from '../shared/ui/dialog'
const dialogOpen = ref(false)
const typeface = ref('mono')
const dark = ref(false)
const name = ref('A quiet place to write')
const description = ref('Shared components keep every feature consistent.')
const clicks = ref(0)
const variants = Object.keys(buttonVariants) as ButtonVariant[]
</script>

<template>
  <main class="ui-theme min-h-screen bg-paper p-6 font-system text-ink sm:p-12" :class="{ dark }">
    <div class="mx-auto max-w-4xl space-y-10">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-sm text-muted">alexopwriter / shared UI</p>
          <h1 class="text-3xl font-semibold">One consistent language.</h1>
        </div>
        <BaseButton variant="outline" :aria-pressed="dark" @click="dark = !dark"
          >Dark theme</BaseButton
        >
      </header>
      <section aria-labelledby="buttons-heading" class="space-y-4">
        <h2 id="buttons-heading">Buttons</h2>
        <div
          v-for="variant in variants"
          :key="variant"
          class="flex flex-wrap items-center gap-4 rounded-control p-2"
          :class="variant === 'inverse' ? 'bg-ink text-paper' : ''"
        >
          <span class="w-20 text-sm" :class="variant === 'inverse' ? '' : 'text-muted'">{{
            variant
          }}</span>
          <BaseButton :variant="variant" @click="clicks++">Small action</BaseButton>
          <BaseButton :variant="variant" size="md" @click="clicks++">Medium action</BaseButton>
          <BaseButton
            :variant="variant"
            size="icon"
            :aria-label="`Add (${variant})`"
            @click="clicks++"
            ><Plus :size="16"
          /></BaseButton>
          <BaseButton :variant="variant" disabled>Unavailable</BaseButton>
        </div>
        <p role="status" class="text-sm text-muted">
          {{ clicks }} actions. Use Tab to inspect keyboard focus.
        </p>
      </section>
      <section aria-labelledby="fields-heading" class="grid gap-4 sm:grid-cols-2">
        <h2 id="fields-heading" class="sm:col-span-2">Fields</h2>
        <label class="grid content-start gap-2">Document name<BaseInput v-model="name" /></label>
        <label class="grid content-start gap-2"
          >Quiet field<BaseInput v-model="name" variant="ghost"
        /></label>
        <label class="grid content-start gap-2"
          >Disabled field<BaseInput model-value="Unavailable" disabled
        /></label>
        <label class="grid content-start gap-2"
          >Image description<BaseTextarea v-model="description" rows="3"
        /></label>
      </section>
      <section class="space-y-4" aria-label="Selection and dialogs">
        <label class="grid content-start gap-2"
          >Typeface<BaseSelect v-model="typeface"
            ><option value="mono">Mono</option>
            <option value="serif">Serif</option></BaseSelect
          ></label
        >
        <BaseButton @click="dialogOpen = true">Open example dialog</BaseButton>
        <BaseDialog v-model:open="dialogOpen" title="A focused choice"
          ><BaseInput aria-label="Example name" placeholder="Name"
        /></BaseDialog>
      </section>
      <section aria-labelledby="tokens-heading">
        <h2 id="tokens-heading">Colors</h2>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div class="rounded-control border border-solid border-line bg-paper p-4">Paper</div>
          <div class="rounded-control bg-ink p-4 text-paper">Ink</div>
          <div class="rounded-control bg-accent p-4 text-accent-foreground">Accent</div>
          <div class="rounded-control bg-soft p-4">Soft</div>
        </div>
      </section>
    </div>
  </main>
</template>
