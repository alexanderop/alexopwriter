import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, ref } from 'vue'
import { DocumentEditor } from '../src/editor/ui'

type SelectionTarget = Readonly<{
  from: number
  to: number
  text: string
  revision: number
  documentId: string
}>

test('Vim inserts text and jj returns to normal mode', async () => {
  const Harness = defineComponent({
    components: { DocumentEditor },
    setup() {
      return { text: ref(''), mode: ref(''), revision: ref(0) }
    },
    template: `<DocumentEditor document-id="a" :text="text" :revision="revision" :vim-enabled="true" @change="(_id, next) => { text = next; revision++ }" @mode="mode = $event" /><output aria-label="Current mode">{{ mode }}</output><output aria-label="Current text">{{ text }}</output>`,
  })
  await render(Harness)
  await page.getByRole('textbox', { name: 'Document editor' }).click()
  await userEvent.keyboard('iA quiet placejj')
  await expect
    .element(page.getByLabelText('Current text'))
    .toHaveTextContent('A quiet place')
  await expect
    .element(page.getByLabelText('Current mode'))
    .toHaveTextContent('NORMAL')
  await userEvent.keyboard('u')
  await expect
    .element(page.getByLabelText('Current text'))
    .toHaveTextContent('')
})

test('a correction is one undoable edit and document switches preserve history', async () => {
  const Harness = defineComponent({
    components: { DocumentEditor },
    setup() {
      const editor = ref<{
        selectRange(from: number, to: number): SelectionTarget | null
        applyReplacement(target: SelectionTarget, replacement: string): boolean
      } | null>(null)
      const text = ref('In order to write.')
      const id = ref('a')
      const revision = ref(0)
      function correct() {
        const target = editor.value?.selectRange(0, 11)
        if (target) editor.value?.applyReplacement(target, 'To')
      }
      return { editor, text, id, revision, correct }
    },
    template: `<DocumentEditor ref="editor" :document-id="id" :text="text" :revision="revision" :vim-enabled="false" @change="(_id, next) => { text = next; revision++ }" /><button @click="correct">Apply correction</button><button @click="id = id === 'a' ? 'b' : 'a'">Switch document</button><output aria-label="Current text">{{ text }}</output>`,
  })
  await render(Harness)
  await page.getByRole('button', { name: 'Apply correction' }).click()
  await expect
    .element(page.getByRole('textbox', { name: 'Document editor' }))
    .toHaveTextContent('To write.')
  await page.getByRole('button', { name: 'Switch document' }).click()
  await page.getByRole('button', { name: 'Switch document' }).click()
  await page.getByRole('textbox', { name: 'Document editor' }).click()
  const modifier = navigator.platform.includes('Mac') ? 'Meta' : 'Control'
  await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
  await expect
    .element(page.getByRole('textbox', { name: 'Document editor' }))
    .toHaveTextContent('In order to write.')
})

test('a proposal captured before another edit cannot replace newer text', async () => {
  const Harness = defineComponent({
    components: { DocumentEditor },
    setup() {
      const editor = ref<{
        selectRange(from: number, to: number): SelectionTarget | null
        applyReplacement(target: SelectionTarget, replacement: string): boolean
      } | null>(null)
      const rejected = ref(false)
      function check() {
        const target = editor.value?.selectRange(0, 4)
        if (!target) return
        editor.value?.applyReplacement(target, 'Newer')
        rejected.value =
          editor.value?.applyReplacement(target, 'Stale') === false
      }
      return { editor, rejected, check }
    },
    template: `<DocumentEditor ref="editor" document-id="a" text="Text here" :revision="0" :vim-enabled="false" /><button @click="check">Apply competing proposals</button><output aria-label="Stale rejected">{{ rejected }}</output>`,
  })
  await render(Harness)
  await page.getByRole('button', { name: 'Apply competing proposals' }).click()
  await expect
    .element(page.getByRole('textbox', { name: 'Document editor' }))
    .toHaveTextContent('Newer here')
  await expect
    .element(page.getByLabelText('Stale rejected'))
    .toHaveTextContent('true')
})

test('metadata revisions stale old proposals while fresh selections remain usable', async () => {
  const Harness = defineComponent({
    components: { DocumentEditor },
    setup() {
      const editor = ref<{
        selectRange(from: number, to: number): SelectionTarget | null
        applyReplacement(target: SelectionTarget, replacement: string): boolean
      } | null>(null)
      const revision = ref(0)
      const staleRejected = ref(false)
      const freshApplied = ref(false)
      let beforeRename: SelectionTarget | null = null
      function capture() {
        beforeRename = editor.value?.selectRange(0, 4) ?? null
      }
      function apply() {
        if (beforeRename)
          staleRejected.value =
            editor.value?.applyReplacement(beforeRename, 'Old') === false
        const target = editor.value?.selectRange(0, 4)
        if (target)
          freshApplied.value =
            editor.value?.applyReplacement(target, 'Fresh') === true
      }
      return { editor, revision, staleRejected, freshApplied, capture, apply }
    },
    template: `<DocumentEditor ref="editor" document-id="a" text="Text here" :revision="revision" :vim-enabled="false" /><button @click="capture">Capture before rename</button><button @click="revision++">Rename document</button><button @click="apply">Apply after rename</button><output aria-label="Old proposal rejected">{{ staleRejected }}</output><output aria-label="Fresh proposal applied">{{ freshApplied }}</output>`,
  })
  await render(Harness)
  await page.getByRole('button', { name: 'Capture before rename' }).click()
  await page.getByRole('button', { name: 'Rename document' }).click()
  await page.getByRole('button', { name: 'Apply after rename' }).click()
  await expect
    .element(page.getByLabelText('Old proposal rejected'))
    .toHaveTextContent('true')
  await expect
    .element(page.getByLabelText('Fresh proposal applied'))
    .toHaveTextContent('true')
  await expect
    .element(page.getByRole('textbox', { name: 'Document editor' }))
    .toHaveTextContent('Fresh here')
})
