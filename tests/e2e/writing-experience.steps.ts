import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { test } from './fixtures'
const { Given, When, Then } = createBdd(test)
Given('I open the writer for the first time', async ({ writing }) => {
  await writing.primary.open()
})
When(
  'I replace all {string} with {string} using Find',
  async ({ writing }, search: string, replacement: string) => {
    await writing.primary.findAndReplace(search, replacement)
  },
)
When('I customize typography, focus, and spelling', async ({ writing }) => {
  await writing.primary.customizeWriting()
})
Then('my writing preferences are retained', async ({ writing }) => {
  await writing.primary.expectWritingPreferences()
})
When('I favorite the document in folder {string}', async ({ writing }, folder: string) => {
  await writing.primary.organizeInFolder(folder)
})
When('I move the document to Trash and restore it', async ({ writing }) => {
  await writing.primary.trashAndRestore()
})
Then('it is a favorite in folder {string}', async ({ writing }, folder: string) => {
  await writing.primary.expectOrganized(folder)
})
When('I read the preview and return to writing', async ({ writing }) => {
  await writing.primary.previewAndReturn()
})
Then('my document contains:', async ({ writing }, text: string) => {
  await writing.primary.expectText(text)
})
When('I download the formatted HTML and Word documents', async ({ writing }) => {
  await writing.primary.downloadFormatted('HTML')
  await writing.primary.downloadFormatted('Word document')
})
When('I navigate to the second heading and replace its selection', async ({ writing }) => {
  await writing.primary.navigateToHeading()
})
Then('my document contains {string} somewhere', async ({ page }, text: string) => {
  await expect(page.getByRole('textbox', { name: 'Document editor', exact: true })).toContainText(
    text,
  )
})

When('I rename the draft and toggle preview using shortcuts', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await editor.focus()
  await page.keyboard.type('Written from the keyboard.')
  await page.keyboard.press('ControlOrMeta+Shift+p')
  const commands = page.getByRole('combobox', { name: 'Search commands' })
  await commands.fill('rename document')
  await commands.press('Enter')
  const title = page.getByRole('textbox', { name: 'Document name' })
  await expect(title).toBeFocused()
  await title.fill('Keyboard.md')
  await title.press('Tab')
  await page.keyboard.press('ControlOrMeta+1')
  await expect(editor).toBeFocused()
  await page.keyboard.press('ControlOrMeta+Shift+v')
  await expect(page.getByRole('button', { name: 'Read only', exact: true })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Shift+v')
  await expect(editor).toBeFocused()
  await expect(title).toHaveValue('Keyboard.md')
})

When('I request shortcut help with question mark outside the editor', async ({ page }) => {
  await page.getByRole('button', { name: 'Command palette', exact: true }).focus()
  await page.keyboard.press('?')
})
Then('the shortcut reference shows app and editing keys', async ({ page, $testInfo }) => {
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(help).toBeVisible()
  await expect(help.getByText('Help: Keyboard shortcuts', { exact: true })).toBeVisible()
  await expect(help.getByText('Undo', { exact: true })).toBeVisible()
  await expect(help.getByText('Copy / cut / paste', { exact: true })).toBeVisible()
  await expect(help.getByText('Next / previous control', { exact: true })).toBeVisible()
  await help.screenshot({ path: $testInfo.outputPath('shortcut-help.png') })
})
When('I close the shortcut reference with Escape', async ({ page }) => {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Document editor' })).toBeFocused()
})
Then('I can continue writing a question mark in my document', async ({ page }) => {
  await page.keyboard.press('?')
  await expect(page.getByRole('textbox', { name: 'Document editor' })).toContainText('?')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
When('I run the question mark command from the palette', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+Shift+p')
  const search = page.getByRole('combobox', { name: 'Search commands' })
  await search.fill('?')
  await expect(page.getByRole('option')).toHaveCount(1)
  await search.press('Enter')
})
Then('only the shortcut reference dialog is open', async ({ page }) => {
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
})
