import { test as base } from 'playwright-bdd'
import { ImagePage } from './pages/ImagePage'
import { WriterPage, type DownloadedCopy } from './pages/WriterPage'

interface WritingScenario {
  readonly primary: WriterPage
  readonly images: ImagePage
  latestDownload?: DownloadedCopy
  second?: WriterPage
  openAnotherTab(): Promise<WriterPage>
  requireDownload(): DownloadedCopy
}

export const test = base.extend<{ writing: WritingScenario }>({
  writing: async ({ page, context }, use, testInfo) => {
    const primary = new WriterPage(page, testInfo)
    const writing: WritingScenario = {
      primary,
      images: new ImagePage(page, primary),
      async openAnotherTab() {
        const actor = new WriterPage(await context.newPage(), testInfo)
        await actor.open()
        return actor
      },
      requireDownload() {
        if (!this.latestDownload) throw new Error('Download a copy before inspecting it')
        return this.latestDownload
      },
    }
    await use(writing)
  },
})
