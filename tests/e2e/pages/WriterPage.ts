import { readFile } from 'node:fs/promises'
import { expect, type Page, type Request, type TestInfo } from '@playwright/test'

export interface Draft {
  readonly name: string
  readonly text: string
}

export interface DownloadedCopy {
  readonly name: string
  readonly bytes: Buffer
}

export class WriterPage {
  constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
  ) {}

  private get editor() {
    return this.page.getByRole('textbox', { name: 'Document editor', exact: true })
  }

  async open() {
    await this.page.goto('./')
    await expect(this.editor).toBeVisible()
  }

  async reload() {
    await this.page.reload()
    await expect(this.editor).toBeVisible()
  }

  async setPreference(name: 'Vim mode' | 'Dark mode' | 'Focus mode', enabled: boolean) {
    const button = this.page.getByRole('button', { name, exact: true })
    if ((await button.getAttribute('aria-pressed')) !== String(enabled)) await button.click()
    await expect(button).toHaveAttribute('aria-pressed', String(enabled))
  }

  async expectPreference(name: 'Vim mode' | 'Dark mode' | 'Focus mode', enabled: boolean) {
    await expect(this.page.getByRole('button', { name, exact: true })).toHaveAttribute(
      'aria-pressed',
      String(enabled),
    )
  }

  async createDocument(text: string) {
    await this.page.getByRole('button', { name: 'New document', exact: true }).click()
    await this.replaceText(text)
  }

  async rename(name: string) {
    const title = this.page.getByRole('textbox', { name: 'Document name', exact: true })
    await title.fill(name)
    await title.press('Tab')
    await expect(title).toHaveValue(name)
  }

  async selectDocument(name: string) {
    await this.page
      .getByRole('complementary', { name: 'Documents', exact: true })
      .getByRole('button', { name, exact: true })
      .click()
    await expect(
      this.page.getByRole('textbox', { name: 'Document name', exact: true }),
    ).toHaveValue(name)
  }

  async replaceText(text: string) {
    await this.editor.fill(text)
    await this.expectText(text)
  }

  async appendText(text: string) {
    await this.editor.focus()
    await this.editor.press('ControlOrMeta+End')
    await this.editor.pressSequentially(text)
  }

  async appendParagraph(text: string) {
    await this.editor.focus()
    await this.editor.press('ControlOrMeta+End')
    await this.editor.press('Enter')
    await this.editor.press('Enter')
    await this.editor.pressSequentially(text)
  }

  async replaceFinalCharacters(count: number, replacement: string) {
    await this.editor.focus()
    await this.editor.press('ControlOrMeta+End')
    for (let index = 0; index < count; index += 1) await this.editor.press('Shift+ArrowLeft')
    await this.editor.pressSequentially(replacement)
  }

  async undo() {
    await this.editor.press('ControlOrMeta+z')
  }

  async redo() {
    await this.editor.press('ControlOrMeta+Shift+z')
  }

  async correctWriting(replacement: string) {
    await this.page.getByRole('button', { name: 'Writing checks', exact: true }).click()
    await this.page
      .getByRole('complementary', { name: 'Writing review', exact: true })
      .getByRole('button', { name: `Use “${replacement}”`, exact: true })
      .click()
  }

  async toggleDocuments() {
    await this.page.getByRole('button', { name: 'Toggle documents', exact: true }).click()
  }

  async expectDocumentsVisible(visible: boolean) {
    await expect(
      this.page.getByRole('complementary', { name: 'Documents', exact: true }),
    ).toBeVisible({ visible })
  }

  async expectWordCount(count: number) {
    await expect(this.page.getByText(`${count} words`, { exact: true })).toBeVisible()
  }

  async vimInsert(text: string) {
    await this.editor.focus()
    await this.editor.press('i')
    await this.editor.pressSequentially(text)
    await this.editor.pressSequentially('jj')
    await expect(this.page.getByRole('button', { name: 'Vim mode', exact: true })).toHaveText(
      'NORMAL',
    )
  }

  async vimUndo() {
    await this.editor.press('u')
  }

  async expectDocumentCopies(name: string, expectedTexts: readonly string[]) {
    const documents = this.page.getByRole('complementary', { name: 'Documents', exact: true })
    const texts: string[] = []
    for (const copyName of [name, `${name} (recovered copy)`]) {
      const copy = documents.getByRole('button', { name: copyName, exact: true })
      await expect(copy).toHaveCount(1)
      await copy.click()
      texts.push(await this.readText())
    }
    expect(texts.sort()).toEqual([...expectedTexts].sort())
  }

  async inspectOptionalHelp() {
    const requests: string[] = []
    const observe = (request: Request) => {
      if (/huggingface|\.onnx(?:$|\?)|tokenizer|safetensors/u.test(request.url()))
        requests.push(request.url())
    }
    this.page.context().on('request', observe)
    try {
      await this.page.getByRole('button', { name: 'Local writing help', exact: true }).click()
      await expect(
        this.page.getByRole('button', { name: 'Manage models in Settings', exact: true }),
      ).toBeVisible()
      await this.appendText(' Still writing.')
      await this.expectSaved()
      await this.page
        .getByRole('button', { name: 'Manage models in Settings', exact: true })
        .click()
      await expect(
        this.page.getByRole('button', { name: 'Download & enable', exact: true }),
      ).toBeVisible()
      expect(requests).toEqual([])
    } finally {
      this.page.context().off('request', observe)
    }
  }

  private async readText() {
    return this.editor.evaluate((element) => {
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement)
        return element.value
      if (element instanceof HTMLElement) {
        const visible = element.cloneNode(true)
        if (!(visible instanceof HTMLElement)) throw new Error('Cannot read editor content')
        visible.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove())
        const blocks = Array.from(visible.children)
        if (
          blocks.length &&
          blocks.every((node) => node.tagName === 'DIV' || node.tagName === 'P')
        ) {
          return blocks
            .map((block) => {
              if (block.childNodes.length === 1 && block.firstChild?.nodeName === 'BR') return ''
              block.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
              return block.textContent ?? ''
            })
            .join('\n')
        }
        visible.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
        return visible.textContent ?? ''
      }
      throw new Error('Document editor must expose native text')
    })
  }

  async expectText(text: string) {
    await expect.poll(() => this.readText()).toBe(text)
  }

  async expectDocument(draft: Draft) {
    await expect(
      this.page.getByRole('textbox', { name: 'Document name', exact: true }),
    ).toHaveValue(draft.name)
    await this.expectText(draft.text)
  }

  async expectSaved() {
    await expect(this.page.getByText('Draft saved in browser', { exact: true })).toBeVisible()
  }

  async importDocument(draft: Draft) {
    await this.importFile({ name: draft.name, bytes: Buffer.from(draft.text) })
    await this.expectText(draft.text)
  }

  async importFile(file: DownloadedCopy) {
    await this.page.getByLabel('Import document', { exact: true }).setInputFiles({
      name: file.name,
      mimeType: 'text/markdown',
      buffer: file.bytes,
    })
    await expect(
      this.page.getByRole('textbox', { name: 'Document name', exact: true }),
    ).toHaveValue(file.name)
  }

  async downloadCopy(): Promise<DownloadedCopy> {
    const pending = this.page.waitForEvent('download')
    await this.page.getByRole('button', { name: 'Download copy', exact: true }).click()
    const download = await pending
    const path = await download.path()
    const bytes = await readFile(path)
    const name = download.suggestedFilename()
    await this.testInfo.attach(name, { body: bytes, contentType: 'text/markdown' })
    return { name, bytes }
  }

  async findAndReplace(search: string, replacement: string) {
    await this.page.getByRole('button', { name: 'Find and replace', exact: true }).click()
    await this.page.getByRole('textbox', { name: 'Find', exact: true }).fill(search)
    await this.page.getByRole('textbox', { name: 'Find', exact: true }).press('Tab')
    await this.page.getByRole('textbox', { name: 'Replace', exact: true }).fill(replacement)
    await this.page.getByRole('textbox', { name: 'Replace', exact: true }).press('Tab')
    await this.page.getByRole('button', { name: 'replace all', exact: true }).click()
    await this.page.getByRole('textbox', { name: 'Find', exact: true }).press('Escape')
    await this.editor.focus()
  }

  async customizeWriting() {
    await this.page.getByRole('button', { name: 'Settings', exact: true }).click()
    await this.page.getByRole('combobox', { name: 'Typeface', exact: true }).selectOption('serif')
    await this.page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('22')
    await this.page.getByRole('combobox', { name: 'Line width', exact: true }).selectOption('wide')
    await this.page
      .getByRole('combobox', { name: 'Focus passage', exact: true })
      .selectOption('sentence')
    await this.page
      .getByRole('combobox', { name: 'Spelling language', exact: true })
      .selectOption('de')
    await this.page.getByRole('button', { name: 'Close panel', exact: true }).click()
  }

  async expectWritingPreferences() {
    await expect(this.editor).toHaveAttribute('spellcheck', 'true')
    await expect(this.editor).toHaveAttribute('lang', 'de')
    await this.page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(this.page.getByRole('combobox', { name: 'Typeface', exact: true })).toHaveValue(
      'serif',
    )
    await expect(this.page.getByRole('combobox', { name: 'Text size', exact: true })).toHaveValue(
      '22',
    )
    await expect(this.page.getByRole('combobox', { name: 'Line width', exact: true })).toHaveValue(
      'wide',
    )
    await expect(
      this.page.getByRole('combobox', { name: 'Focus passage', exact: true }),
    ).toHaveValue('sentence')
    await this.page.getByRole('button', { name: 'Close panel', exact: true }).click()
  }

  async organizeInFolder(folder: string) {
    await this.page.getByRole('button', { name: 'Add favorite', exact: true }).click()
    await this.page.getByRole('combobox', { name: 'Document folder', exact: true }).fill(folder)
    await this.page.getByRole('combobox', { name: 'Document folder', exact: true }).press('Tab')
    await this.expectSaved()
  }

  async trashAndRestore() {
    await this.page.getByRole('button', { name: 'Move to Trash', exact: true }).click()
    await this.page.getByLabel('Document collection', { exact: true }).selectOption('trash')
    await this.page.getByRole('button', { name: 'Restore', exact: true }).click()
    await this.page.getByLabel('Document collection', { exact: true }).selectOption('all')
  }

  async expectOrganized(folder: string) {
    await expect(
      this.page.getByRole('button', { name: 'Remove favorite', exact: true }),
    ).toBeVisible()
    await expect(
      this.page.getByRole('combobox', { name: 'Document folder', exact: true }),
    ).toHaveValue(folder)
    await this.page.getByLabel('Document collection', { exact: true }).selectOption('favorites')
  }

  async previewAndReturn() {
    await this.page.getByRole('button', { name: 'Toggle preview', exact: true }).click()
    const preview = this.page.getByRole('region', { name: 'Document preview', exact: true })
    await expect(preview.getByRole('heading', { name: 'An essay', exact: true })).toBeVisible()
    await expect(preview).toContainText('A bold thought.')
    await this.page.getByRole('button', { name: 'Read only', exact: true }).click()
    await expect(this.editor).toBeHidden()
    await this.page.getByRole('button', { name: 'Close preview', exact: true }).click()
    await expect(this.editor).toBeVisible()
  }

  async downloadFormatted(format: 'HTML' | 'Word document') {
    await this.page.getByRole('button', { name: 'Export document', exact: true }).click()
    const pending = this.page.waitForEvent('download')
    await this.page.getByRole('button', { name: `Download ${format}`, exact: true }).click()
    const download = await pending
    const bytes = await readFile(await download.path())
    await this.testInfo.attach(download.suggestedFilename(), { body: bytes })
    if (format === 'HTML') {
      expect(download.suggestedFilename()).toMatch(/\.html$/)
      expect(bytes.toString('utf8')).toContain('<strong>bold</strong>')
      expect(bytes.toString('utf8')).toContain('An essay')
    } else {
      expect(download.suggestedFilename()).toMatch(/\.docx$/)
      expect(bytes.subarray(0, 2).toString()).toBe('PK')
    }
  }

  async navigateToHeading() {
    await this.editor.press('ControlOrMeta+k')
    await expect(this.page.getByRole('dialog', { name: 'Quick navigation' })).toBeVisible()
    await this.page.getByRole('button', { name: 'Headings', exact: true }).click()
    await this.page
      .getByRole('textbox', { name: 'Search documents or headings' })
      .fill('Second section')
    await this.page.getByRole('textbox', { name: 'Search documents or headings' }).press('Enter')
    await expect(this.page.getByRole('dialog')).toHaveCount(0)
    await expect(this.editor).toBeFocused()
    await this.editor.pressSequentially('Replacement heading')
  }

  async waitForOfflineAvailability() {
    await this.page.evaluate(async () => {
      await navigator.serviceWorker.ready
      if (navigator.serviceWorker.controller) return
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      )
    })
  }
}
