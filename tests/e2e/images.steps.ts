import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from './fixtures'

const { Given, When, Then } = createBdd(test)
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='
const source = `data:image/png;base64,${png}`

Given('I open an empty image writing workspace', async ({ writing }) => {
  await writing.primary.open()
  await writing.primary.setPreference('Vim mode', false)
})
When('I paste a copied image into my document', async ({ writing }) => {
  await writing.images.pastePng(png)
})
Then('the pasted image is displayed and saved in browser recovery', async ({ writing }) => {
  await writing.images.expectVisible('Pasted image')
  await writing.primary.expectSaved()
  await writing.primary.expectWordCount(0)
})
When('I reload the image writing workspace', async ({ writing }) => {
  await writing.primary.reload()
})
Then('the recovered image is displayed', async ({ writing }) => {
  await writing.images.expectSource('Pasted image', source, 1)
})
When('I download and reimport the illustrated document', async ({ writing }) => {
  const download = await writing.primary.downloadCopy()
  expect(download.bytes.toString('utf8')).toBe(`![Pasted image](${source})`)
  await writing.primary.importFile({ name: 'Illustrated.md', bytes: download.bytes })
})
Then('the imported image has the original bytes', async ({ writing }) => {
  await writing.images.expectSource('Pasted image', source, 1)
})

When('I describe the image manually', async ({ writing }) => {
  await writing.images.describeManually('A [red] pixel \\ sample')
})
Then('my image description is recovered and included in the download', async ({ writing }) => {
  await writing.images.expectDescription('A [red] pixel \\ sample')
  const download = await writing.primary.downloadCopy()
  expect(download.bytes.toString('utf8')).toBe(`![A \\[red\\] pixel \\\\ sample](${source})`)
})
