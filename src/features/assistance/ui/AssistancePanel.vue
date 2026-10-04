<script setup lang="ts">
import { BaseButton } from '../../../shared/ui/button'
import { X, Check, ArrowRight } from '@lucide/vue'
import type { AssistantState, WritingAction } from '../domain/assistant'
import type { WritingIssue } from '../domain/review'
defineProps<{
  panel: 'review' | 'assist'
  issues: readonly WritingIssue[]
  assistantState: AssistantState
  selected: boolean
  proposal: { readonly text: string } | null
}>()
const emit = defineEmits<{
  close: []; settings: []; 'select-range': [from: number, to: number]; 'apply-issue': [from: number, to: number, replacement: string]
  accept: []; discard: []; suggest: [action: WritingAction]
}>()
</script>
<template>
      <aside
        class="review-panel"
        @keydown.esc.stop="emit('close')"
        :aria-label="
          panel === 'review' ? 'Writing review' : 'Local writing help'
        "
      >
        <div class="panel-header">
          <h2>
            {{ panel === 'review' ? 'Writing review' : 'Writing help' }}
          </h2>
          <BaseButton
            size="icon"
            aria-label="Close panel"
            @click="emit('close')"
          >
            <X :size="17" />
          </BaseButton>
        </div>
        <template v-if="panel === 'review'">
          <p class="panel-description">
            Small suggestions. Your voice stays yours.
          </p>
          <span class="eyebrow"
            >{{ issues.length }}
            {{ issues.length === 1 ? 'SUGGESTION' : 'SUGGESTIONS' }} · NO MODEL
            NEEDED</span
          >
          <div v-if="!issues.length" class="review-empty">
            <Check :size="22" />
            <p>No issues found by these checks.<br />Keep going.</p>
          </div>
          <article v-for="issue in issues" :key="issue.id" class="issue-card">
            <BaseButton
              variant="soft" class="issue-excerpt"
              @click="emit('select-range', issue.from, issue.to)"
            >
              {{ issue.text }}
            </BaseButton>
            <p>{{ issue.message }}</p>
            <BaseButton
              v-if="issue.replacement !== undefined"
              variant="text"
              @click="emit('apply-issue', issue.from, issue.to, issue.replacement)"
            >
              Use “{{ issue.replacement }}” <ArrowRight :size="13" />
            </BaseButton>
          </article>
        </template>
        <template v-else>
          <p class="panel-description">
            Optional assistance that runs on your device. Select a passage, then
            choose what you need.
          </p>
          <p class="panel-description">{{ assistantState.message }}</p>
          <BaseButton @click="emit('settings')">Manage models in Settings</BaseButton>
          <div v-if="assistantState.phase === 'ready'" class="assist-actions">
            <p>
              {{
                selected
                  ? 'Work with your selected passage.'
                  : 'Select some text in the editor to begin.'
              }}
            </p>
            <BaseButton variant="outline" class="justify-between" :disabled="!selected" @click="emit('suggest', 'shorten')">
              Make it shorter <ArrowRight :size="14" /></BaseButton
            ><BaseButton variant="outline" class="justify-between" :disabled="!selected" @click="emit('suggest', 'clarify')">
              Make it clearer <ArrowRight :size="14" /></BaseButton
            ><BaseButton variant="outline" class="justify-between" :disabled="!selected" @click="emit('suggest', 'heading')">
              Suggest a heading <ArrowRight :size="14" />
            </BaseButton>
          </div>
          <div v-if="proposal" class="proposal">
            <span class="eyebrow">SUGGESTED WORDING</span>
            <p>{{ proposal.text }}</p>
            <div class="proposal-actions">
              <BaseButton variant="primary" @click="emit('accept')">Accept</BaseButton
              ><BaseButton @click="emit('discard')">Discard</BaseButton>
            </div>
          </div>
        </template>
      </aside>
</template>
