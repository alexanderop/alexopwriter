import { test as base, expect, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const test = base.extend({
  context: async ({ playwright, baseURL }, use) => {
    if (!baseURL) throw new Error('The model test requires a preview URL.')
    const profile = await mkdtemp(join(tmpdir(), 'alexopwriter-model-'))
    try {
      const context = await playwright.chromium.launchPersistentContext(profile, {
        headless: true,
        baseURL,
      })
      try {
        await use(context)
      } finally {
        await context.close()
      }
    } finally {
      await rm(profile, { recursive: true, force: true })
    }
  },
})

async function waitForModel(page: Page, timeout: number) {
  const ready = page.getByText('Ready on this device', { exact: true })
  const notice = page.locator('.app-notice')
  await expect(ready.or(notice)).toBeVisible({ timeout })
  if (await notice.isVisible()) throw new Error(await notice.innerText())
  await expect(ready).toBeVisible()
}

test('a downloaded local model proposes an undoable heading and reloads offline', async ({
  page,
  context,
}, testInfo) => {
  await page.goto('./')
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await expect(editor).toBeVisible()
  const vim = page.getByRole('button', { name: 'Vim mode', exact: true })
  if ((await vim.getAttribute('aria-pressed')) === 'true') await vim.click()
  const original =
    'Walking in the forest helps me slow down and notice the birds.'
  await editor.fill(original)
  await editor.press('ControlOrMeta+a')
  await page
    .getByRole('button', { name: 'Local writing help', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Download & enable', exact: true })
    .click()
  await waitForModel(page, 540_000)
  await page
    .getByRole('button', { name: 'Suggest a heading', exact: true })
    .click()
  const proposal = page.locator('.proposal > p')
  await expect(proposal).toBeVisible({ timeout: 120_000 })
  const result = await proposal.innerText()
  expect(result.trim().length).toBeGreaterThan(0)
  await testInfo.attach('model-output', {
    body: result,
    contentType: 'text/plain',
  })
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(editor).toHaveText(result)
  await editor.press('ControlOrMeta+z')
  await expect(editor).toHaveText(original)
  await page.screenshot({
    path: testInfo.outputPath('local-model.png'),
    fullPage: true,
  })
  await expect(
    page.getByText('Draft saved in browser', { exact: true }),
  ).toBeVisible()
  const cacheInventory = await page.evaluate(async () => ({
    storage: await navigator.storage.estimate(),
    caches: await Promise.all((await caches.keys()).map(async (name) => ({
      name,
      urls: (await (await caches.open(name)).keys()).map((request) => request.url),
    }))),
  }))
  await testInfo.attach('model-cache', {
    body: JSON.stringify(cacheInventory, null, 2),
    contentType: 'application/json',
  })
  await context.setOffline(true)
  await page.reload()
  await expect(editor).toHaveText(original)
  await page
    .getByRole('button', { name: 'Local writing help', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Download & enable', exact: true })
    .click()
  await waitForModel(page, 120_000)
  await editor.click()
  await editor.press('ControlOrMeta+a')
  await page
    .getByRole('button', { name: 'Suggest a heading', exact: true })
    .click()
  await expect(proposal).toBeVisible({ timeout: 120_000 })
  expect((await proposal.innerText()).trim().length).toBeGreaterThan(0)
  await expect(editor).toHaveText(original)
})
