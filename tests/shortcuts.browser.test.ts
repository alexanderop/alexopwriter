import { afterEach, beforeEach, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'
import axe from 'axe-core'
import App from '../src/App.vue'
import { createTestServices } from './support/services'
import '../src/style.css'
const mod = navigator.platform.includes('Mac') ? 'Meta' : 'Control'
async function press(key: string, shift = false) {
  await userEvent.keyboard(
    `{${mod}>}${shift ? '{Shift>}' : ''}${key}${shift ? '{/Shift}' : ''}{/${mod}}`,
  )
}
async function command(query: string) {
  await press('p', true)
  await page.getByRole('combobox', { name: 'Search commands' }).fill(query)
  await userEvent.keyboard('{Enter}')
}
beforeEach(() => {
  localStorage.setItem('alexopwriter-vim', 'false')
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

test('palette executes commands with the keyboard and returns focus without losing editor history', async () => {
  await render(App, { props: { services: createTestServices() } })
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await editor.fill('Keyboard draft')
  await command('toggle dark theme')
  await expect.element(editor).toHaveFocus()
  await command('rename document')
  const title = page.getByRole('textbox', { name: 'Document name' })
  await expect.element(title).toHaveFocus()
  await title.fill('Keyboard title')
  await userEvent.keyboard('{Tab}')
  await press('1')
  await expect.element(editor).toHaveFocus()
  await press('p', true)
  await userEvent.keyboard('{Escape}')
  await expect.element(editor).toHaveFocus()
  await expect.element(editor).toHaveTextContent('Keyboard draft')
  await press('z')
  await expect.element(editor).not.toHaveTextContent('Keyboard draft')
})

test('quick open, heading navigation, preview and Zen chord are usable from the editor', async () => {
  await render(App, { props: { services: createTestServices() } })
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await editor.fill('# First\n\n## Second\n\nText')
  await press('p')
  await expect.element(page.getByRole('dialog', { name: 'Quick navigation' })).toBeVisible()
  await userEvent.keyboard('{Escape}')
  await press('o', true)
  await page.getByRole('textbox', { name: 'Search documents or headings' }).fill('Second')
  await userEvent.keyboard('{Enter}')
  await expect.element(editor).toHaveFocus()
  await press('v', true)
  await expect.element(page.getByRole('button', { name: 'Read only', exact: true })).toBeVisible()
  await press('k')
  await userEvent.keyboard('z')
  await expect
    .element(page.getByRole('button', { name: 'Focus mode' }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect.element(editor).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  await press('k')
  await press('s')
  await expect.element(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
})

test('palette navigates results and keeps modal typing isolated from app shortcuts', async () => {
  await render(App, { props: { services: createTestServices() } })
  await expect.element(page.getByRole('textbox', { name: 'Document editor' })).toBeVisible()
  await press('p', true)
  const search = page.getByRole('combobox', { name: 'Search commands' })
  expect(
    (await axe.run(page.getByRole('dialog', { name: 'Command palette' }).element())).violations,
  ).toEqual([])
  await search.fill('typeface')
  await userEvent.keyboard('{ArrowDown}{Enter}')
  await expect
    .poll(() => JSON.parse(localStorage.getItem('alexopwriter-writing') ?? '{}').font)
    .toBe('serif')
  await press('p', true)
  await press('n')
  await expect.element(search).toHaveFocus()
  await search.fill('no command matches this')
  await userEvent.keyboard('{ArrowDown}{Enter}')
  await expect.element(page.getByText('No matching commands.')).toBeVisible()
})

test('document commands focus folder controls, trash and restore without losing the draft', async () => {
  await render(App, { props: { services: createTestServices() } })
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await editor.fill('Keep this draft')
  await command('show trash')
  await command('move document to folder')
  const folder = page.getByRole('combobox', { name: 'Document folder' })
  await expect.element(folder).toHaveFocus()
  await folder.fill('Essays')
  await userEvent.keyboard('{Tab}')
  await command('move document to trash')
  await command('trash: restore')
  await press('p')
  await userEvent.keyboard('{Enter}')
  await expect.element(editor).toHaveTextContent('Keep this draft')
  await command('move document to folder')
  await expect.element(folder).toHaveValue('Essays')
})

test('question mark preserves text fields and palette search opens help without stacking dialogs', async () => {
  await render(App, { props: { services: createTestServices() } })
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await editor.fill('Why')
  await userEvent.keyboard('?')
  await expect.element(editor).toHaveTextContent('Why?')
  const title = page.getByRole('textbox', { name: 'Document name' })
  await title.fill('Title')
  await userEvent.keyboard('?')
  await expect.element(title).toHaveValue('Title?')
  await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
  await press('p', true)
  await page.getByRole('combobox', { name: 'Search commands' }).fill(' ? ')
  await expect.element(page.getByRole('option', { name: /Help: Keyboard shortcuts/ })).toBeVisible()
  await userEvent.keyboard('{Enter}')
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect.element(help).toBeVisible()
  await expect
    .element(page.getByRole('dialog', { name: 'Command palette' }))
    .not.toBeInTheDocument()
  expect((await axe.run(help.element())).violations).toEqual([])
  await userEvent.keyboard('{Escape}')
  await expect.element(editor).toHaveFocus()
})

test('question mark on app controls ignores composition, repeats and modifiers before opening help', async () => {
  await render(App, { props: { services: createTestServices() } })
  const button = page.getByRole('button', { name: 'Command palette', exact: true }).element()
  button.focus()
  for (const guarded of [
    { isComposing: true },
    { repeat: true },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
  ]) {
    button.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true, ...guarded }))
  }
  await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
  await userEvent.keyboard('?')
  await expect.element(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await userEvent.keyboard('{Escape}')
  await expect.element(page.getByRole('textbox', { name: 'Document editor' })).toHaveFocus()
})
