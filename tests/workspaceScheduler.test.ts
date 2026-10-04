import { expect, it } from 'vitest'
import { manualScheduler, memoryRecovery, testWorkspace } from './support/workspace'
import { hasUnsecuredChanges } from '../src/features/documents'

it('coalesces edits and recovers the latest text through the injected scheduler', async () => {
  const scheduler = manualScheduler()
  const recovery = memoryRecovery()
  const workspace = testWorkspace({ scheduler, recovery })
  try {
    await workspace.create('draft.md', 'original')
    workspace.edited('document-1', 'first')
    workspace.edited('document-1', 'latest')
    expect(scheduler.pending()).toBe(1)
    expect(workspace.snapshot().documents.some(hasUnsecuredChanges)).toBe(true)
    expect((await recovery.list())[0]?.text).toBe('original')
    scheduler.run()
    await expect.poll(async () => (await recovery.list())[0]?.text).toBe('latest')
    expect(workspace.snapshot().documents.some(hasUnsecuredChanges)).toBe(false)
    expect(scheduler.pending()).toBe(0)
  } finally {
    await workspace.dispose()
  }
})

it('flushes pending edits before closing and cancels scheduled work', async () => {
  const scheduler = manualScheduler()
  const recovery = memoryRecovery()
  const workspace = testWorkspace({ scheduler, recovery })
  await workspace.importDocument({ name: 'import.md', text: 'original' })
  workspace.edited('document-1', 'last edit')
  await workspace.dispose()
  expect(scheduler.pending()).toBe(0)
  expect((await recovery.list())[0]?.text).toBe('last edit')
})
