import { expect, type Page, type Request } from '@playwright/test'
import type { WriterPage } from './WriterPage'

export class ImagePage {
  constructor(private readonly page: Page, private readonly writer: WriterPage) {}

  private get image() {
    return this.page.locator('.document-editor .embedded-image')
  }

  async pastePng(base64: string) {
    const editor = this.page.getByRole('textbox', { name: 'Document editor', exact: true })
    await editor.focus()
    await editor.evaluate((element, bytes) => {
      const image = new File([Uint8Array.from(atob(bytes), character => character.charCodeAt(0))], 'copied.png', { type: 'image/png' })
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: { files: [image] } })
      element.dispatchEvent(event)
      if (!event.defaultPrevented) throw new Error('The editor did not accept the image paste')
    }, base64)
  }

  async expectVisible(description: string) {
    await expect(this.page.getByRole('img', { name: description, exact: true })).toBeVisible()
  }

  async expectSource(description: string, source: string, width: number) {
    const image = this.page.getByRole('img', { name: description, exact: true })
    await expect(image).toHaveAttribute('src', source)
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(width)
  }

  async expectDescription(description: string) {
    await expect(this.image).toHaveAttribute('alt', description)
  }

  async describeManually(description: string) {
    const modelRequests: string[] = []
    const observe = (request: Request) => {
      if (request.url().includes('huggingface.co')) modelRequests.push(request.url())
    }
    this.page.on('request', observe)
    try {
      await this.page.getByRole('button', { name: 'Edit alt text', exact: true }).click()
      await this.page.getByRole('textbox', { name: 'Alt text', exact: true }).fill(description)
      await this.page.getByRole('button', { name: 'Apply alt text', exact: true }).click()
      await this.expectDescription(description)
      await this.page.getByRole('button', { name: 'Settings', exact: true }).click()
      await expect(this.page.getByRole('button', { name: 'Download image model', exact: true })).toBeVisible()
      await this.writer.expectSaved()
      expect(modelRequests).toEqual([])
    } finally {
      this.page.off('request', observe)
    }
  }
}
