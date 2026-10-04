import { readFile } from 'node:fs/promises'
import { expect } from '@playwright/test'
import { createBdd, test } from 'playwright-bdd'
const { Given, When, Then } = createBdd(test)
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='
const source = `data:image/png;base64,${png}`

Given('I open an empty image writing workspace', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('textbox', { name: 'Document editor' })).toBeVisible()
  if (await page.getByRole('button', { name: 'Vim mode' }).getAttribute('aria-pressed') === 'true')
    await page.getByRole('button', { name: 'Vim mode' }).click()
})
When('I paste a copied image into my document', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Document editor' }).focus()
  await page.getByRole('textbox', { name: 'Document editor' }).evaluate((editor, bytes) => {
    const image = new File([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))], 'copied.png', { type: 'image/png' })
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { files: [image] } })
    editor.dispatchEvent(event)
    if (!event.defaultPrevented) throw new Error('The editor did not accept the image paste')
  }, png)
})
Then('the pasted image is displayed and saved in browser recovery', async ({ page }) => {
  await expect(page.getByRole('img', { name: 'Pasted image' })).toBeVisible()
  await expect(page.getByText('Draft saved in browser', { exact: true })).toBeVisible()
  await expect(page.getByText('0 words', { exact: true })).toBeVisible()
})
When('I reload the image writing workspace', async ({ page }) => { await page.reload() })
Then('the recovered image is displayed', async ({ page }) => {
  await expect(page.getByRole('img', { name: 'Pasted image' })).toHaveAttribute('src', source)
  await expect.poll(() => page.getByRole('img', { name: 'Pasted image' }).evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(1)
})
When('I download and reimport the illustrated document', async ({ page }) => {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download copy' }).click()
  const download = await pending
  const path = await download.path()
  expect(path).not.toBeNull()
  const bytes = await readFile(path!)
  expect(bytes.toString('utf8')).toBe(`![Pasted image](${source})`)
  await page.getByLabel('Import document').setInputFiles({ name: 'Illustrated.md', mimeType: 'text/markdown', buffer: bytes })
})
Then('the imported image has the original bytes', async ({ page }) => {
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue('Illustrated.md')
  await expect(page.getByRole('img', { name: 'Pasted image' })).toHaveAttribute('src', source)
  await expect.poll(() => page.getByRole('img', { name: 'Pasted image' }).evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(1)
})
