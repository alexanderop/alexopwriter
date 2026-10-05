import { afterEach, beforeEach, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'
import App from '../src/App.vue'
import { createBrowserServices } from '../src/app/bootstrap'
import { deleteDatabase } from './helpers/indexedDb'
import '../src/style.css'
beforeEach(async () => {
  await page.viewport(1280, 900)
  await deleteDatabase('alexopwriter-web')
  localStorage.clear()
})
afterEach(async () => {
  cleanup()
  await deleteDatabase('alexopwriter-web')
  localStorage.clear()
})

test('removing the last document from a folder returns the library to all documents', async () => {
  await render(App, { props: { services: createBrowserServices() } })
  const folder = page.getByRole('combobox', { name: 'Document folder' })
  await folder.fill('Essays')
  await userEvent.tab()
  await page.getByRole('combobox', { name: 'Document collection' }).selectOptions('folder:Essays')
  await folder.fill('Notes')
  await userEvent.tab()
  await expect
    .element(page.getByRole('combobox', { name: 'Document collection' }))
    .toHaveValue('all')
  await expect.element(page.getByRole('button', { name: 'Untitled.md', exact: true })).toBeVisible()
})

test('the last document stays recoverable from Trash without creating a replacement', async () => {
  const services = createBrowserServices()
  await render(App, { props: { services } })
  await page.getByRole('textbox', { name: 'Document editor' }).fill('Keep this draft.')
  await page.getByRole('button', { name: 'Move to Trash' }).click()
  await page.getByRole('combobox', { name: 'Document collection' }).selectOptions('trash')
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect
    .element(page.getByRole('textbox', { name: 'Document editor' }))
    .toHaveTextContent('Keep this draft.')
  expect(services.workspace.snapshot().documents).toHaveLength(1)
})

test('quick navigation focuses search and returns to the selected editor', async () => {
  await render(App, { props: { services: createBrowserServices() } })
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await editor.fill('# A heading\n\nParagraph.')
  await page.getByRole('button', { name: 'Quick navigation', exact: true }).click()
  const search = page.getByRole('textbox', { name: 'Search documents or headings' })
  await expect.element(search).toHaveFocus()
  await page.getByRole('button', { name: 'Headings', exact: true }).click()
  await search.fill('A heading')
  await userEvent.keyboard('{Enter}')
  await expect.element(editor).toHaveFocus()
  await userEvent.keyboard('Changed heading')
  await expect.poll(() => editor.element().textContent).toContain('Changed heading')
  await expect.poll(() => editor.element().textContent).toContain('Paragraph.')
})

test('closing an export dialog in reading view restores visible preview focus', async () => {
  await render(App, { props: { services: createBrowserServices() } })
  await page.getByRole('textbox', { name: 'Document editor' }).fill('# Reading')
  await page.getByRole('button', { name: 'Toggle preview' }).click()
  await page.getByRole('button', { name: 'Read only', exact: true }).click()
  await page.getByRole('button', { name: 'Export document', exact: true }).click()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect.element(page.getByRole('article', { name: 'Preview of Untitled.md' })).toHaveFocus()
})
