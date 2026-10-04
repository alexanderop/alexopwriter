import { createTestServices } from './support/services'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'
import { deleteDatabase } from './helpers/indexedDb'
import axe from 'axe-core'
import App from '../src/App.vue'
import { createBrowserServices } from '../src/app/bootstrap'
import '../src/style.css'

beforeEach(async () => {
  await page.viewport(1280, 900)
  await deleteDatabase('alexopwriter-web')
  localStorage.setItem('alexopwriter-vim', 'false')
  localStorage.setItem('alexopwriter-dark', 'false')
})
afterEach(async () => {
  cleanup()
  await deleteDatabase('alexopwriter-web')
  localStorage.removeItem('alexopwriter-vim')
  localStorage.removeItem('alexopwriter-dark')
})

test('the real writing review corrects the document and undo restores the original', async () => {
  await render(App, { props: { services: createBrowserServices() } })
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await editor.fill('In order to write, begin with one sentence.')
  await page.getByRole('button', { name: 'Writing checks' }).click()
  await page.getByRole('button', { name: 'Use “To”' }).click()
  await expect.element(editor).toHaveTextContent('To write, begin with one sentence.')
  const modifier = navigator.platform.includes('Mac') ? 'Meta' : 'Control'
  await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
  await expect.element(editor).toHaveTextContent('In order to write, begin with one sentence.')
  await expect.element(page.getByText('Draft saved in browser', { exact: true })).toBeVisible()
})

test('the full writing screen and review drawer pass accessibility checks in both themes', async () => {
  await render(App, { props: { services: createBrowserServices() } })
  await page
    .getByRole('textbox', { name: 'Document editor' })
    .fill('In order to write, begin with one sentence.')
  await page.getByRole('button', { name: 'Writing checks' }).click()
  await expect.element(page.getByText('Draft saved in browser', { exact: true })).toBeVisible()
  const app = document.querySelector('.app-shell')
  if (!(app instanceof HTMLElement)) throw new Error('The writing application did not render.')
  expect((await axe.run(app)).violations).toEqual([])
  await page.getByRole('button', { name: 'Dark mode' }).click()
  expect((await axe.run(app)).violations).toEqual([])
})

test('Markdown formats as it is typed without changing the editable source', async () => {
  await render(App, { props: { services: createBrowserServices() } })
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  const source =
    '# A heading\n\n## A subheading\n\nPlain **bold** and *italic*.\n\n> A quotation\n\n[Link](https://example.com)\n\n- A list item'
  await editor.fill(source)
  function style(selector: string) {
    const element = document.querySelector(`.document-editor ${selector}`)
    if (!(element instanceof HTMLElement)) throw new Error(`Missing rendered Markdown: ${selector}`)
    return getComputedStyle(element)
  }
  await expect.poll(() => style('.fs-md-h1').fontSize).toBe('30.6px')
  expect(style('.fs-md-h2').fontSize).toBe('25.2px')
  expect(style('.fs-md-strong:not(.fs-md-mark)').fontWeight).toBe('700')
  expect(style('.fs-md-em:not(.fs-md-mark)').fontStyle).toBe('italic')
  expect(style('.fs-md-quote:not(.fs-md-mark)').fontStyle).toBe('italic')
  expect(style('.fs-md-url').textDecorationLine).toBe('underline')
  expect(style('.fs-md-mark').color).not.toBe(style('.cm-content').color)
  const modifier = navigator.platform.includes('Mac') ? 'Meta' : 'Control'
  await editor.click()
  await userEvent.keyboard(`{${modifier}>}a{/${modifier}}`)
  await userEvent.keyboard('Plain text')
  await expect.element(editor).toHaveTextContent('Plain text')
  expect(document.querySelector('.document-editor .fs-md-h1')).toBeNull()
  await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
  await expect.poll(() => style('.fs-md-h1').fontSize).toBe('30.6px')
  expect(editor.element().textContent).toBe(source.replaceAll('\n', ''))
})

test.each([false, true])(
  'the connected suggestion workflow reports acceptance after download (stale=%s)',
  async (stale) => {
    const { testWorkspace } = await import('./support/workspace')
    const { controlledAssistant } = await import('./support/controlledAssistant')
    const control = controlledAssistant()
    await render(App, {
      props: {
        services: createTestServices({ workspace: testWorkspace(), assistant: control.assistant }),
      },
    })
    const editor = page.getByRole('textbox', { name: 'Document editor' })
    await editor.fill('An original passage.')
    const modifier = navigator.platform.includes('Mac') ? 'Meta' : 'Control'
    await editor.click()
    await userEvent.keyboard(`{${modifier}>}a{/${modifier}}`)
    await page.getByRole('button', { name: 'Local writing help' }).click()
    await page.getByRole('button', { name: 'Make it clearer' }).click()
    expect(control.requests[0]?.text).toBe('An original passage.')
    control.requests[0]?.resolve('A clearer passage.')
    await expect.element(page.getByRole('button', { name: 'Accept', exact: true })).toBeVisible()
    if (stale) await page.getByRole('textbox', { name: 'Document name' }).fill('Renamed.md')
    await page.getByRole('button', { name: 'Download copy' }).click()
    await expect
      .element(page.getByText('Download requested. Your original file is unchanged.'))
      .toBeVisible()
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    if (stale) {
      await expect
        .element(
          page.getByText(
            'Your document changed. Select the passage and request a fresh suggestion.',
          ),
        )
        .toBeVisible()
      await expect.element(editor).toHaveTextContent('An original passage.')
      return
    }
    await expect
      .element(page.getByText('Suggestion applied. Undo will restore your original.'))
      .toBeVisible()
    await expect.element(editor).toHaveTextContent('A clearer passage.')
    await editor.click()
    await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
    await expect.element(editor).toHaveTextContent('An original passage.')
  },
)

test('switching documents rejects late suggestions through the real application wiring', async () => {
  const { testWorkspace } = await import('./support/workspace')
  const { controlledAssistant } = await import('./support/controlledAssistant')
  const control = controlledAssistant()
  await render(App, {
    props: {
      services: createTestServices({ workspace: testWorkspace(), assistant: control.assistant }),
    },
  })
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await editor.fill('Keep my passage.')
  const modifier = navigator.platform.includes('Mac') ? 'Meta' : 'Control'
  await editor.click()
  await userEvent.keyboard(`{${modifier}>}a{/${modifier}}`)
  await page.getByRole('button', { name: 'Local writing help' }).click()
  await page.getByRole('button', { name: 'Make it clearer' }).click()
  await page.getByRole('button', { name: 'Download copy' }).click()
  await page.getByRole('button', { name: 'New document', exact: true }).click()
  await expect
    .element(page.getByRole('button', { name: 'Dismiss notification' }))
    .not.toBeInTheDocument()
  control.requests[0]?.resolve('Late replacement.')
  await expect
    .element(page.getByRole('button', { name: 'Accept', exact: true }))
    .not.toBeInTheDocument()
  await expect.element(editor).toHaveTextContent('Start writing. This space is yours.')
  expect(control.cancellations()).toBe(1)
})

test('a waiting update is visible and another tab activating it does not reload this draft', async () => {
  let activated: (() => void) | undefined
  await render(App, {
    props: {
      services: createBrowserServices(),
      registerUpdates(callbacks) {
        callbacks.onNeedRefresh()
        activated = callbacks.onNeedReload
        return async () => {}
      },
    },
  })
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await editor.fill('Keep writing while another tab updates.')
  activated?.()
  await expect.element(page.getByRole('button', { name: 'Update app' })).toBeVisible()
  await expect.element(editor).toHaveTextContent('Keep writing while another tab updates.')
})

test('image suggestions stay editable until Apply, persist, and undo as one change', async () => {
  const { createImageCaption } = await import('../src/features/assistance/adapters/imageCaption')
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='
  const source = `data:image/png;base64,${png}`
  let resolve: (text: string) => void = () => undefined
  const caption = createImageCaption({ inspect: async () => 'available' })
  const capability = {
    ...caption,
    describe: () =>
      new Promise<string>((finish) => {
        resolve = finish
      }),
  }
  await render(App, { props: { services: { ...createTestServices(), captions: capability } } })
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await editor.fill(`![Original](${source})`)
  await page.getByRole('button', { name: 'Edit alt text', exact: true }).click()
  await page.getByRole('button', { name: 'Generate alt text', exact: true }).click()
  resolve('A lake.')
  const alt = page.getByRole('textbox', { name: 'Alt text', exact: true })
  await expect.element(alt).toHaveValue('A lake.')
  expect(document.querySelector('.document-editor img.embedded-image')?.getAttribute('alt')).toBe(
    'Original',
  )
  await alt.fill('A quiet [lake].')
  await page.getByRole('button', { name: 'Apply alt text', exact: true }).click()
  expect(document.querySelector('.document-editor img.embedded-image')?.getAttribute('alt')).toBe(
    'A quiet [lake].',
  )
  const modifier = navigator.platform.includes('Mac') ? 'Meta' : 'Control'
  await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
  expect(document.querySelector('.document-editor img.embedded-image')?.getAttribute('alt')).toBe(
    'Original',
  )
})

test('late generation keeps newer manual text and cannot re-open an abandoned image editor', async () => {
  const { createImageCaption } = await import('../src/features/assistance/adapters/imageCaption')
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='
  let resolve: (text: string) => void = () => undefined
  const caption = createImageCaption({ inspect: async () => 'available' })
  await render(App, {
    props: {
      services: {
        ...createTestServices(),
        captions: {
          ...caption,
          describe: () =>
            new Promise<string>((finish) => {
              resolve = finish
            }),
        },
      },
    },
  })
  await page
    .getByRole('textbox', { name: 'Document editor' })
    .fill(`![Original](data:image/png;base64,${png})`)
  await page.getByRole('button', { name: 'Edit alt text', exact: true }).click()
  await page.getByRole('button', { name: 'Generate alt text', exact: true }).click()
  const alt = page.getByRole('textbox', { name: 'Alt text', exact: true })
  await alt.fill('My manual edit')
  resolve('Late model text')
  await expect
    .element(
      page.getByText(
        'Your alt text changed while generating. Kept your edit; generate again if needed.',
      ),
    )
    .toBeVisible()
  await expect.element(alt).toHaveValue('My manual edit')
  await page.getByRole('button', { name: 'Generate alt text', exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  resolve('Abandoned text')
  await expect.element(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await expect.element(alt).not.toBeInTheDocument()
  await page.getByRole('button', { name: 'Close panel' }).click()
  await expect.element(page.getByRole('button', { name: 'Settings', exact: true })).toHaveFocus()
  await page.getByRole('button', { name: 'Edit alt text', exact: true }).click()
  await expect.element(alt).toHaveValue('Original')
  await userEvent.keyboard('{Escape}')
  await expect
    .element(page.getByRole('button', { name: 'Edit alt text', exact: true }))
    .toHaveFocus()
})
