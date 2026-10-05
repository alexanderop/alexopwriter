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
