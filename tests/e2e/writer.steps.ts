import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { test } from './fixtures'

const { Given, When, Then } = createBdd(test)

Given('I have opened the browser writer', async ({ writing }) => {
  await writing.primary.open()
  await writing.primary.setPreference('Vim mode', false)
})
When('I create a document containing {string}', async ({ writing }, text: string) => {
  await writing.primary.createDocument(text)
})
When('the browser has saved my draft', async ({ writing }) => {
  await writing.primary.expectSaved()
})
When('I reload the app', async ({ writing }) => {
  await writing.primary.reload()
})
Then('my document contains {string}', async ({ writing }, text: string) => {
  await writing.primary.expectText(text)
})
When('I import a file containing {string}', async ({ writing }, text: string) => {
  await writing.primary.importDocument({ name: 'essay.md', text })
})
When('I replace its contents with {string}', async ({ writing }, text: string) => {
  await writing.primary.replaceText(text)
})
When('I download a copy', async ({ writing }) => {
  writing.latestDownload = await writing.primary.downloadCopy()
})
Then('the downloaded file contains {string}', async ({ writing }, text: string) => {
  expect(writing.requireDownload().bytes).toEqual(Buffer.from(text, 'utf8'))
})
Given('the app is available offline', async ({ writing }) => {
  await writing.primary.waitForOfflineAvailability()
})
When('I disconnect from the network', async ({ context }) => {
  await context.setOffline(true)
})

When('I name the document {string}', async ({ writing }, name: string) => {
  await writing.primary.rename(name)
})
When('I select document {string}', async ({ writing }, name: string) => {
  await writing.primary.selectDocument(name)
})
When('I import {string} containing {string}', async ({ writing }, name: string, text: string) => {
  await writing.primary.importDocument({ name, text })
})
When('I append {string}', async ({ writing }, text: string) => {
  await writing.primary.appendText(text)
})
When('I undo the edit', async ({ writing }) => {
  await writing.primary.undo()
})
When('I redo the edit', async ({ writing }) => {
  await writing.primary.redo()
})
When('I apply the writing correction {string}', async ({ writing }, replacement: string) => {
  await writing.primary.correctWriting(replacement)
})
When(
  'I import the Markdown document {string}:',
  async ({ writing }, name: string, text: string) => {
    await writing.primary.importDocument({ name, text })
  },
)
Then(
  'the downloaded {string} exactly contains:',
  async ({ writing }, name: string, text: string) => {
    const copy = writing.requireDownload()
    expect(copy.name).toBe(name)
    expect(copy.bytes).toEqual(Buffer.from(text, 'utf8'))
  },
)
When('I reimport the downloaded copy', async ({ writing }) => {
  const copy = writing.requireDownload()
  await writing.primary.importDocument({ name: copy.name, text: copy.bytes.toString('utf8') })
})
When('I enable {string}', async ({ writing }, preference: string) => {
  if (preference !== 'Vim mode' && preference !== 'Dark mode' && preference !== 'Focus mode')
    throw new Error(`Unknown preference: ${preference}`)
  await writing.primary.setPreference(preference, true)
})
When('I disable {string}', async ({ writing }, preference: string) => {
  if (preference !== 'Vim mode' && preference !== 'Dark mode' && preference !== 'Focus mode')
    throw new Error(`Unknown preference: ${preference}`)
  await writing.primary.setPreference(preference, false)
})
Then('{string} is enabled', async ({ writing }, preference: string) => {
  if (preference !== 'Vim mode' && preference !== 'Dark mode' && preference !== 'Focus mode')
    throw new Error(`Unknown preference: ${preference}`)
  await writing.primary.expectPreference(preference, true)
})
Then('{string} is disabled', async ({ writing }, preference: string) => {
  if (preference !== 'Vim mode' && preference !== 'Dark mode' && preference !== 'Focus mode')
    throw new Error(`Unknown preference: ${preference}`)
  await writing.primary.expectPreference(preference, false)
})
When(
  'I insert {string} with Vim and leave insert mode with jj',
  async ({ writing }, text: string) => {
    await writing.primary.vimInsert(text)
  },
)
When('I undo with Vim', async ({ writing }) => {
  await writing.primary.vimUndo()
})
When('I toggle the documents sidebar', async ({ writing }) => {
  await writing.primary.toggleDocuments()
})
Then('the documents sidebar is hidden', async ({ writing }) => {
  await writing.primary.expectDocumentsVisible(false)
})
Then('the documents sidebar is visible', async ({ writing }) => {
  await writing.primary.expectDocumentsVisible(true)
})
When('I inspect optional writing help without enabling it', async ({ writing }) => {
  await writing.primary.inspectOptionalHelp()
})
When('another tab opens the saved shared document', async ({ writing }) => {
  writing.second = await writing.openAnotherTab()
  await writing.second.selectDocument('Shared.md')
  await writing.second.expectDocument({ name: 'Shared.md', text: 'Shared seed.' })
})
When('the other tab changes its copy to {string}', async ({ writing }, text: string) => {
  if (!writing.second) throw new Error('Open another tab before editing it')
  await writing.second.replaceText(text)
  await writing.second.expectSaved()
})
Then(
  'a fresh tab recovers both {string} and {string}',
  async ({ writing }, first: string, second: string) => {
    const recovered = await writing.openAnotherTab()
    await recovered.expectDocumentCopies('Shared.md', [first, second])
  },
)
When(
  'I replace the final {int} characters with {string} using the keyboard',
  async ({ writing }, count: number, replacement: string) => {
    await writing.primary.replaceFinalCharacters(count, replacement)
  },
)
Then('the word count is {int}', async ({ writing }, count: number) => {
  await writing.primary.expectWordCount(count)
})

When('I type a new paragraph {string}', async ({ writing }, text: string) => {
  await writing.primary.appendParagraph(text)
})
Then(
  'my document is named {string} and contains:',
  async ({ writing }, name: string, text: string) => {
    await writing.primary.expectDocument({ name, text })
  },
)
