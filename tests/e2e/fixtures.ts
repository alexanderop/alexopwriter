import { test as base } from 'playwright-bdd'
import { WriterPage, type DownloadedCopy } from './pages/WriterPage'

interface WritingScenario {
  readonly primary: WriterPage
  latestDownload?: DownloadedCopy
  second?: WriterPage
  openAnotherTab(): Promise<WriterPage>
  requireDownload(): DownloadedCopy
}

export const test = base.extend<{ writing: WritingScenario }>({
  writing: async ({ page, context }, use, testInfo) => {
    const writing: WritingScenario = {
      primary: new WriterPage(page, testInfo),
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
