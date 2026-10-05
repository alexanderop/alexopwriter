import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, ref } from 'vue'
import { DocumentEditor } from '../src/features/editor/ui'
import { defaultWritingPreferences } from '../src/features/editor'
import '../src/style.css'

test('find and replace all uses editor history and follows the current document', async () => {
  const Harness = defineComponent({
    components: { DocumentEditor },
    setup() {
      const editor = ref<InstanceType<typeof DocumentEditor> | null>(null)
      const id = ref('a')
      return { editor, id }
    },
    template: `<DocumentEditor ref="editor" :document-id="id" :text="id === 'a' ? 'quiet quiet' : 'other words'" :revision="0" :vim-enabled="false" /><button @click="editor?.openSearch()">Find</button><button @click="id = id === 'a' ? 'b' : 'a'">Switch</button>`,
  })
  await render(Harness)
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await page.getByRole('textbox', { name: 'Find', exact: true }).fill('quiet')
  await page.getByRole('textbox', { name: 'Replace', exact: true }).fill('calm')
  await page.getByRole('button', { name: 'replace all', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await expect.element(editor).toHaveTextContent('calm calm')
  await page.getByRole('button', { name: 'Switch', exact: true }).click()
  await expect.element(editor).toHaveTextContent('other words')
  await page.getByRole('button', { name: 'Switch', exact: true }).click()
  await editor.click()
  const modifier = navigator.platform.includes('Mac') ? 'Meta' : 'Control'
  await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
  await expect.element(editor).toHaveTextContent('quiet quiet')
})

test('writing preferences refresh cached documents and focus keeps the selected passage readable', async () => {
  const Harness = defineComponent({
    components: { DocumentEditor },
    setup() {
      const preferences = ref({ ...defaultWritingPreferences })
      const id = ref('a')
      function change() {
        preferences.value = {
          ...preferences.value,
          font: 'serif',
          fontSize: 24,
          spellcheck: false,
          language: 'de',
          focus: 'sentence',
        }
      }
      return { preferences, id, change }
    },
    template: `<DocumentEditor :document-id="id" text="First sentence. Another one." :revision="0" :vim-enabled="false" :preferences="preferences" :focus-enabled="true" /><button @click="id = id === 'a' ? 'b' : 'a'">Switch</button><button @click="change">Change preferences</button>`,
  })
  await render(Harness)
  await page.getByRole('button', { name: 'Switch' }).click()
  await page.getByRole('button', { name: 'Change preferences' }).click()
  await page.getByRole('button', { name: 'Switch' }).click()
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await expect.element(editor).toHaveAttribute('spellcheck', 'false')
  await expect.element(editor).toHaveAttribute('lang', 'de')
  await expect.poll(() => getComputedStyle(editor.element()).fontSize).toBe('24px')
  await expect
    .poll(() => document.querySelector('.writing-dimmed')?.textContent)
    .toBe('Another one.')
})

test('typewriter centers the caret in the actual writing viewport and does not recenter when unfocused', async () => {
  const text = Array.from({ length: 70 }, (_, i) => `Line ${i}`).join('\n')
  const target = text.indexOf('Line 40')
  const Harness = defineComponent({
    components: { DocumentEditor },
    setup() {
      const editor = ref<InstanceType<typeof DocumentEditor> | null>(null)
      const preferences = ref({ ...defaultWritingPreferences, typewriter: true })
      function select() {
        editor.value?.selectRange(target, target)
      }
      function unfocus() {
        preferences.value = { ...preferences.value, fontSize: 20 }
      }
      return { editor, preferences, text, select, unfocus }
    },
    template: `<div class="writing-area" style="height:300px;overflow-y:auto;padding:0"><DocumentEditor ref="editor" document-id="a" :text="text" :revision="0" :vim-enabled="false" :preferences="preferences" /></div><button @click="select">Choose passage</button><button @click="unfocus">Leave editor</button>`,
  })
  await render(Harness)
  await page.getByRole('button', { name: 'Choose passage' }).click()
  function centerDistance() {
    const area = document.querySelector('.writing-area')?.getBoundingClientRect()
    const caret = document.querySelector('.cm-cursor')?.getBoundingClientRect()
    return area && caret
      ? Math.abs((caret.top + caret.bottom) / 2 - (area.top + area.bottom) / 2)
      : Infinity
  }
  await expect.poll(centerDistance).toBeLessThan(4)
  await page.getByRole('button', { name: 'Leave editor' }).click()
  const area = document.querySelector<HTMLElement>('.writing-area')!
  area.scrollTop = 40
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  expect(area.scrollTop).toBe(40)
})
