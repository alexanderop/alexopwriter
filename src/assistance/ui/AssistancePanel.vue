<script setup lang="ts">
import { X, Check, ArrowRight, Download } from '@lucide/vue'
import type { AssistantState, WritingAction } from '../domain/assistant'
import type { WritingIssue } from '../domain/review'
import { MODEL_INFO } from '../domain/modelInfo'
defineProps<{
  panel: 'review' | 'assist'
  issues: readonly WritingIssue[]
  assistantState: AssistantState
  busy: boolean
  selected: boolean
  proposal: { readonly text: string } | null
}>()
const emit = defineEmits<{
  close: []; 'select-range': [from: number, to: number]; 'apply-issue': [from: number, to: number, replacement: string]
  enable: []; cancel: []; remove: []; accept: []; discard: []; suggest: [action: WritingAction]
}>()
</script>
<template>
      <aside
        class="review-panel"
        :aria-label="
          panel === 'review' ? 'Writing review' : 'Local writing help'
        "
      >
        <div class="panel-header">
          <h2>
            {{ panel === 'review' ? 'Writing review' : 'Writing help' }}
          </h2>
          <button
            class="icon-button"
            aria-label="Close panel"
            @click="emit('close')"
          >
            <X :size="17" />
          </button>
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
            <button
              class="issue-excerpt"
              @click="emit('select-range', issue.from, issue.to)"
            >
              {{ issue.text }}
            </button>
            <p>{{ issue.message }}</p>
            <button
              v-if="issue.replacement !== undefined"
              class="text-action"
              @click="emit('apply-issue', issue.from, issue.to, issue.replacement)"
            >
              Use “{{ issue.replacement }}” <ArrowRight :size="13" />
            </button>
          </article>
        </template>
        <template v-else>
          <p class="panel-description">
            Optional assistance that runs on your device. Select a passage, then
            choose what you need.
          </p>
          <div class="model-card">
            <span class="eyebrow">LOCAL MODEL</span>
            <h3>{{ MODEL_INFO.name }}</h3>
            <p>
              {{ MODEL_INFO.downloadLabel }} download. Text is processed in this
              browser. English writing quality may vary.
            </p>
            <button
              v-if="
                assistantState.phase === 'disabled' ||
                assistantState.phase === 'error'
              "
              class="primary-button"
              @click="emit('enable')"
            >
              Download &amp; enable <Download :size="14" />
            </button>
            <template v-if="busy"
              ><progress
                :value="assistantState.progress"
                max="100"
                aria-label="Model progress"
              />
              <p role="status">{{ assistantState.message }}</p>
              <button @click="emit('cancel')">Cancel</button></template
            >
            <p v-if="assistantState.phase === 'ready'" class="ready-state">
              <span class="local-dot" />Ready on this device
            </p>
          </div>
          <div v-if="assistantState.phase === 'ready'" class="assist-actions">
            <p>
              {{
                selected
                  ? 'Work with your selected passage.'
                  : 'Select some text in the editor to begin.'
              }}
            </p>
            <button :disabled="!selected" @click="emit('suggest', 'shorten')">
              Make it shorter <ArrowRight :size="14" /></button
            ><button :disabled="!selected" @click="emit('suggest', 'clarify')">
              Make it clearer <ArrowRight :size="14" /></button
            ><button :disabled="!selected" @click="emit('suggest', 'heading')">
              Suggest a heading <ArrowRight :size="14" />
            </button>
          </div>
          <div v-if="proposal" class="proposal">
            <span class="eyebrow">SUGGESTED WORDING</span>
            <p>{{ proposal.text }}</p>
            <div class="proposal-actions">
              <button class="primary-button" @click="emit('accept')">Accept</button
              ><button @click="emit('discard')">Discard</button>
            </div>
          </div>
          <button
            v-if="!busy"
            class="text-action remove-model"
            @click="emit('remove')"
          >
            Remove downloaded model
          </button>
        </template>
      </aside>
</template>
