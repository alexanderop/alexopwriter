import { afterEach, beforeEach, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'
import Dexie from 'dexie'
import axe from 'axe-core'
import App from '../src/App.vue'
import '../src/style.css'

beforeEach(async () => {
  await page.viewport(1280, 900)
  await Dexie.delete('alexopwriter-web')
  localStorage.setItem('alexopwriter-vim', 'false')
  localStorage.setItem('alexopwriter-dark', 'false')
})
afterEach(async () => {
  cleanup()
  await Dexie.delete('alexopwriter-web')
  localStorage.removeItem('alexopwriter-vim')
  localStorage.removeItem('alexopwriter-dark')
})

test('the real writing review corrects the document and undo restores the original', async () => {
  await render(App)
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await editor.fill('In order to write, begin with one sentence.')
  await page.getByRole('button', { name: 'Writing checks' }).click()
  await page.getByRole('button', { name: 'Use “To”' }).click()
  await expect
    .element(editor)
    .toHaveTextContent('To write, begin with one sentence.')
  const modifier = navigator.platform.includes('Mac') ? 'Meta' : 'Control'
  await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
  await expect
    .element(editor)
    .toHaveTextContent('In order to write, begin with one sentence.')
  await expect
    .element(page.getByText('Draft saved in browser', { exact: true }))
    .toBeVisible()
})

test('the full writing screen and review drawer pass accessibility checks in both themes', async () => {
  await render(App)
  await page
    .getByRole('textbox', { name: 'Document editor' })
    .fill('In order to write, begin with one sentence.')
  await page.getByRole('button', { name: 'Writing checks' }).click()
  await expect
    .element(page.getByText('Draft saved in browser', { exact: true }))
    .toBeVisible()
  const app = document.querySelector('.app-shell')
  if (!(app instanceof HTMLElement))
    throw new Error('The writing application did not render.')
  expect((await axe.run(app)).violations).toEqual([])
  await page.getByRole('button', { name: 'Dark mode' }).click()
  expect((await axe.run(app)).violations).toEqual([])
})

test('Markdown formats as it is typed without changing the editable source', async () => {
  await render(App)
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  const source = '# A heading\n\n## A subheading\n\nPlain **bold** and *italic*.\n\n> A quotation\n\n[Link](https://example.com)\n\n- A list item'
  await editor.fill(source)
  function style(selector: string) {
    const element = document.querySelector(`.document-editor ${selector}`)
    if (!(element instanceof HTMLElement)) throw new Error(`Missing rendered Markdown: ${selector}`)
    return getComputedStyle(element)
  }
  await expect.poll(() => style('.fs-md-h1').fontSize).toBe('30.6px')
  expect(style('.fs-md-h2').fontSize).toBe('25.2px')
  expect(style('.fs-md-strong:not(.fs-md-mark)').fontWeight).toBe('700')
  expect(style('.fs-md-em:not(.fs-md-mark)').fontStyle).toBe('italic')
  expect(style('.fs-md-quote:not(.fs-md-mark)').fontStyle).toBe('italic')
  expect(style('.fs-md-url').textDecorationLine).toBe('underline')
  expect(style('.fs-md-mark').color).not.toBe(style('.cm-content').color)
  const modifier = navigator.platform.includes('Mac') ? 'Meta' : 'Control'
  await editor.click()
  await userEvent.keyboard(`{${modifier}>}a{/${modifier}}`)
  await userEvent.keyboard('Plain text')
  await expect.element(editor).toHaveTextContent('Plain text')
  expect(document.querySelector('.document-editor .fs-md-h1')).toBeNull()
  await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
  await expect.poll(() => style('.fs-md-h1').fontSize).toBe('30.6px')
  expect(editor.element().textContent).toBe(source.replaceAll('\n', ''))
})

test('a waiting update is visible and another tab activating it does not reload this draft', async () => {
  let activated: (() => void) | undefined
  await render(App, {
    props: {
      registerUpdates(callbacks) {
        callbacks.onNeedRefresh()
        activated = callbacks.onNeedReload
        return async () => {}
      },
    },
  })
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await editor.fill('Keep writing while another tab updates.')
  activated?.()
  await expect.element(page.getByRole('button', { name: 'Update app' })).toBeVisible()
  await expect.element(editor).toHaveTextContent('Keep writing while another tab updates.')
})
