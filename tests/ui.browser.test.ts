import axe from 'axe-core'
import UiGallery from '../src/app/UiGallery.vue'
import { expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, ref, useTemplateRef } from 'vue'
import { BaseButton } from '../src/shared/ui/button'
import { BaseInput } from '../src/shared/ui/input'
import { BaseTextarea } from '../src/shared/ui/textarea'
import '../src/style.css'

it('keeps button keyboard activation, disabled behavior, and explicit focus inside a form', async () => {
  render(
    defineComponent({
      components: { BaseButton },
      setup() {
        const clicks = ref(0)
        const submits = ref(0)
        const action = useTemplateRef<InstanceType<typeof BaseButton>>('action')
        return { clicks, submits, action }
      },
      template: `<form @submit.prevent="submits++">
      <BaseButton ref="action" @click="clicks++" aria-label="Save draft">Save</BaseButton>
      <BaseButton disabled @click="clicks++">Unavailable</BaseButton>
      <BaseButton @click="action?.focus()">Focus save</BaseButton>
      <output>{{ clicks }} clicks, {{ submits }} submits</output>
    </form>`,
    }),
  )
  await page.getByRole('button', { name: 'Focus save' }).click()
  await expect.element(page.getByRole('button', { name: 'Save draft' })).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await userEvent.keyboard(' ')
  await expect.element(page.getByRole('status')).toHaveTextContent('2 clicks, 0 submits')
  await expect.element(page.getByRole('button', { name: 'Unavailable' })).toBeDisabled()
  await userEvent.tab()
  await expect.element(page.getByRole('button', { name: 'Focus save' })).toHaveFocus()
})

it('preserves native change events, model updates, and textarea focus', async () => {
  render(
    defineComponent({
      components: { BaseButton, BaseInput, BaseTextarea },
      setup() {
        const title = ref('Draft')
        const alt = ref('')
        const changed = ref('')
        const description = useTemplateRef<InstanceType<typeof BaseTextarea>>('description')
        function change(event: Event) {
          if (event.target instanceof HTMLInputElement) changed.value = event.target.value
        }
        return { title, alt, changed, description, change }
      },
      template: `<div><BaseInput v-model="title" aria-label="Title" @change="change" />
      <BaseTextarea ref="description" v-model="alt" aria-label="Description" />
      <BaseButton @click="description?.focus()">Focus description</BaseButton>
      <output>{{ title }} / {{ changed }} / {{ alt }}</output></div>`,
    }),
  )
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('New name')
  await page.getByRole('button', { name: 'Focus description' }).click()
  await expect
    .element(page.getByRole('textbox', { name: 'Description', exact: true }))
    .toHaveFocus()
  await userEvent.keyboard('A forest')
  await expect.element(page.getByRole('status')).toHaveTextContent('New name / New name / A forest')
})

it('renders every shared control with accessible contrast in both themes', async () => {
  await render(UiGallery)
  const gallery = document.querySelector('main')
  if (!(gallery instanceof HTMLElement)) throw new Error('Gallery did not render')
  for (const dark of [false, true]) {
    if (dark) await page.getByRole('button', { name: 'Dark theme' }).click()
    expect((await axe.run(gallery)).violations).toEqual([])
    const inverse = page.getByRole('button', { name: 'Add (inverse)', exact: true }).element()
    const parent = inverse.parentElement
    if (!parent) throw new Error('Inverse example has no background')
    expect(getComputedStyle(inverse).color).toBe(getComputedStyle(parent).color)
    expect(getComputedStyle(inverse).color).not.toBe(getComputedStyle(parent).backgroundColor)
  }
})
