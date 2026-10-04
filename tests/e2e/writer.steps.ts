import { readFile } from 'node:fs/promises'
import { createBdd, test } from 'playwright-bdd'
import { expect } from '@playwright/test'

const { Given, When, Then } = createBdd(test)

Given('I have opened the browser writer', async ({ page }) => {
  await page.goto('./')
  await expect(
    page.getByRole('textbox', { name: 'Document editor' }),
  ).toBeVisible()
  const vim = page.getByRole('button', { name: 'Vim mode', exact: true })
  if ((await vim.getAttribute('aria-pressed')) === 'true') await vim.click()
})

When(
  'I create a document containing {string}',
  async ({ page }, text: string) => {
    await page
      .getByRole('button', { name: 'New document', exact: true })
      .click()
    await page.getByRole('textbox', { name: 'Document editor' }).fill(text)
  },
)

When('the browser has saved my draft', async ({ page }) => {
  await expect(
    page.getByText('Draft saved in browser', { exact: true }),
  ).toBeVisible()
})

When('I reload the app', async ({ page }) => {
  await page.reload()
})

When(
  'I edit the document in two tabs to {string} and {string}',
  async ({ page, context }, firstText: string, secondText: string) => {
    const firstEditor = page.getByRole('textbox', { name: 'Document editor' })
    const original = await firstEditor.textContent()
    const second = await context.newPage()
    try {
      await second.goto(page.url())
      const secondEditor = second.getByRole('textbox', {
        name: 'Document editor',
      })
      await expect(secondEditor).toHaveText(original ?? '')
      await firstEditor.fill(firstText)
      await secondEditor.fill(secondText)
      await expect(
        page.getByText('Draft saved in browser', { exact: true }),
      ).toBeVisible()
      await expect(
        second.getByText('Draft saved in browser', { exact: true }),
      ).toBeVisible()
      await expect(firstEditor).toHaveText(firstText)
      await expect(secondEditor).toHaveText(secondText)
    } finally {
      await second.close()
    }
  },
)

Then(
  'both recovered versions contain {string} and {string}',
  async ({ page }, firstText: string, secondText: string) => {
    const documents = page
      .getByRole('complementary', { name: 'Documents' })
      .getByRole('button', { name: /^essay\.md(?: \(recovered copy\))?$/u })
    await expect(documents).toHaveCount(2)
    const versions: string[] = []
    for (const document of await documents.all()) {
      await document.click()
      await expect(document).toHaveAttribute('aria-current', 'page')
      versions.push(
        await page.getByRole('textbox', { name: 'Document editor' }).innerText(),
      )
    }
    expect(versions.sort()).toEqual([firstText, secondText].sort())
  },
)

Then('my document contains {string}', async ({ page }, text: string) => {
  await expect(
    page.getByRole('textbox', { name: 'Document editor' }),
  ).toHaveText(text)
})

When('I import a file containing {string}', async ({ page }, text: string) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'essay.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(text),
  })
  await expect(
    page.getByRole('textbox', { name: 'Document editor' }),
  ).toHaveText(text)
})

When('I replace its contents with {string}', async ({ page }, text: string) => {
  await page.getByRole('textbox', { name: 'Document editor' }).fill(text)
})

When('I download a copy', async ({ page }) => {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download copy', exact: true }).click()
  const result = await download
  const path = await result.path()
  await test
    .info()
    .attach('downloaded-document', { path, contentType: 'text/plain' })
  const bytes = await readFile(path, 'utf8')
  await page.evaluate((content) => {
    sessionStorage.setItem('download-test-content', content)
  }, bytes)
})

Then(
  'the downloaded file contains {string}',
  async ({ page }, text: string) => {
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem('download-test-content'),
      ),
    ).toBe(text)
  },
)

Given('the app is available offline', async ({ page }) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (navigator.serviceWorker.controller) return
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => resolve(),
        { once: true },
      )
    })
  })
})

When('I disconnect from the network', async ({ context }) => {
  await context.setOffline(true)
})
