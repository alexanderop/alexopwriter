import { expect, it } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { z } from 'zod'
import { createIndexedDbStore } from '../src/shared/storage/indexedDb'
import { useQueryAtom } from '../src/shared/storage/useQueryAtom'
import { indexedDbRecovery } from '../src/features/documents/adapters/indexedDbRecovery'
import { deleteDatabase } from './helpers/indexedDb'

const schema = z.object({ id: z.string(), value: z.number() })
function createStore(name: string) {
  return createIndexedDbStore({
    name,
    version: 1,
    store: 'items',
    keyPath: 'id',
    indexes: [],
    decode: (value) => schema.parse(value),
    keyOf: (row) => row.id,
  })
}

it('rejects a write closed inside its callback without leaking browser errors', async () => {
  const name = crypto.randomUUID()
  const store = createStore(name)
  const errors: string[] = []
  const recordError = (event: ErrorEvent) => {
    errors.push(event.message)
    event.preventDefault()
  }
  window.addEventListener('error', recordError)
  try {
    await store.update('a', () => ({ id: 'a', value: 1 }))
    await expect(
      store.update('a', () => {
        store.close()
        return { id: 'a', value: 2 }
      }),
    ).rejects.toThrow('closed')
    const reopened = createStore(name)
    try {
      expect(await reopened.query((rows) => rows).read()).toEqual([{ id: 'a', value: 1 }])
      expect(errors).toEqual([])
    } finally {
      reopened.close()
    }
  } finally {
    window.removeEventListener('error', recordError)
    store.close()
    await deleteDatabase(name)
  }
})

it('observes committed changes across owners and preserves atomic concurrent updates', async () => {
  const name = crypto.randomUUID()
  const first = createStore(name)
  const second = createStore(name)
  const query = first.query((rows) => rows.reduce((sum, row) => sum + row.value, 0))
  const stop = query.subscribe(() => {})
  try {
    await expect.poll(() => query.snapshot()).toEqual({ status: 'ready', value: 0 })
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        (index % 2 ? first : second).update('a', (previous) => ({
          id: 'a',
          value: (previous?.value ?? 0) + 1,
        })),
      ),
    )
    await expect.poll(() => query.snapshot()).toEqual({ status: 'ready', value: 12 })
    expect(await query.read()).toBe(12)
    stop()
    await second.update('a', () => ({ id: 'a', value: 13 }))
    const remount = query.subscribe(() => {})
    await expect.poll(() => query.snapshot()).toEqual({ status: 'ready', value: 13 })
    remount()
  } finally {
    stop()
    first.close()
    second.close()
    await deleteDatabase(name)
  }
})

it('rejects failed and invalid mutations without committing them', async () => {
  const name = crypto.randomUUID()
  const store = createStore(name)
  const rows = store.query((rows) => rows)
  try {
    await store.update('a', () => ({ id: 'a', value: 1 }))
    await expect(
      store.update('a', () => {
        throw new Error('Guard failed')
      }),
    ).rejects.toThrow('Guard failed')
    await expect(store.update('a', () => ({ id: 'b', value: 2 }))).rejects.toThrow(
      'cannot change its key',
    )
    await expect(store.update('a', () => ({ id: 'a', value: NaN }))).rejects.toThrow()
    expect(await rows.read()).toEqual([{ id: 'a', value: 1 }])
  } finally {
    store.close()
    await deleteDatabase(name)
  }
})

it('recovers a selector failure on a later committed write', async () => {
  const name = crypto.randomUUID()
  const store = createStore(name)
  const query = store.query((rows) => {
    if (!rows.length) throw new Error('Missing row')
    return rows[0]?.value
  })
  const stop = query.subscribe(() => {})
  try {
    await expect.poll(() => query.snapshot().status).toBe('error')
    await store.update('a', () => ({ id: 'a', value: 4 }))
    await expect.poll(() => query.snapshot()).toEqual({ status: 'ready', value: 4 })
    store.close()
    expect(query.snapshot().status).toBe('error')
    await expect(query.read()).rejects.toThrow('closed')
  } finally {
    stop()
    store.close()
    await deleteDatabase(name)
  }
})

it('closes a pending open without leaking a connection', async () => {
  const name = crypto.randomUUID()
  const store = createStore(name)
  const read = store.query((rows) => rows).read()
  store.close()
  await expect(read).rejects.toThrow('closed')
  await deleteDatabase(name)
})

it('releases and changes Vue atom subscriptions with their scope', async () => {
  const name = crypto.randomUUID()
  const store = createStore(name)
  const first = store.query((rows) => rows.length)
  const second = store.query((rows) => rows.length + 10)
  const source = shallowRef(first)
  const scope = effectScope()
  const state = scope.run(() => useQueryAtom(() => source.value))
  try {
    await expect.poll(() => state?.value).toEqual({ status: 'ready', value: 0 })
    source.value = second
    await nextTick()
    await expect.poll(() => state?.value).toEqual({ status: 'ready', value: 10 })
    expect(first.snapshot()).toEqual({ status: 'loading' })
    scope.stop()
    await store.update('a', () => ({ id: 'a', value: 1 }))
    expect(state?.value).toEqual({ status: 'ready', value: 10 })
    expect(second.snapshot()).toEqual({ status: 'loading' })
  } finally {
    scope.stop()
    store.close()
    await deleteDatabase(name)
  }
})

it('opens a legacy native version 10 database without changing its drafts or indexes', async () => {
  const name = crypto.randomUUID()
  const record = {
    id: 'a',
    actor: 'old-tab',
    name: 'old.md',
    text: 'Retained',
    revision: 7,
    updatedAt: 10,
  }
  const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 10)
    request.onupgradeneeded = () => {
      const drafts = request.result.createObjectStore('drafts', {
        keyPath: ['id', 'actor'],
      })
      drafts.createIndex('id', 'id')
      drafts.createIndex('updatedAt', 'updatedAt')
      drafts.put(record)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  legacy.close()
  const recovery = indexedDbRecovery(name)
  try {
    expect(await recovery.list()).toEqual([record])
    await recovery.put({ ...record, revision: 8, text: 'Updated' })
    expect((await recovery.list())[0]?.text).toBe('Updated')
  } finally {
    recovery.close()
    await deleteDatabase(name)
  }
})

it('preserves the newest competing revision for the same draft key', async () => {
  const name = crypto.randomUUID()
  const first = indexedDbRecovery(name)
  const second = indexedDbRecovery(name)
  const base = {
    id: 'a',
    actor: 'same',
    name: 'file.md',
    text: 'text',
    updatedAt: 10,
  }
  try {
    await Promise.all([first.put({ ...base, revision: 9 }), second.put({ ...base, revision: 2 })])
    expect((await first.list())[0]?.revision).toBe(9)
    await second.put({ ...base, revision: 9, text: 'Equal revision accepted' })
    expect((await first.list())[0]?.text).toBe('Equal revision accepted')
  } finally {
    first.close()
    second.close()
    await deleteDatabase(name)
  }
})

it('settles a committed update when a subscriber closes the owner during notification', async () => {
  const name = crypto.randomUUID()
  const store = createStore(name)
  const query = store.query((rows) => rows.length)
  let closeOnRefresh = false
  const stop = query.subscribe((state) => {
    if (closeOnRefresh && state.status === 'loading') store.close()
  })
  try {
    await expect.poll(() => query.snapshot()).toEqual({ status: 'ready', value: 0 })
    closeOnRefresh = true
    await store.update('a', () => ({ id: 'a', value: 1 }))
    const reopened = createStore(name)
    try {
      expect(await reopened.query((rows) => rows).read()).toEqual([{ id: 'a', value: 1 }])
    } finally {
      reopened.close()
    }
  } finally {
    stop()
    store.close()
    await deleteDatabase(name)
  }
})

it('rejects a native clone failure and leaves existing bytes intact', async () => {
  const name = crypto.randomUUID()
  const row = z.object({ id: z.string(), value: z.unknown() })
  const store = createIndexedDbStore({
    name,
    version: 1,
    store: 'items',
    keyPath: 'id',
    indexes: [],
    decode: (value) => row.parse(value),
    keyOf: (value) => value.id,
  })
  try {
    await store.update('a', () => ({ id: 'a', value: 1 }))
    await expect(store.update('a', () => ({ id: 'a', value: () => 2 }))).rejects.toThrow()
    expect(await store.query((rows) => rows).read()).toEqual([{ id: 'a', value: 1 }])
  } finally {
    store.close()
    await deleteDatabase(name)
  }
})

it('surfaces version changes to subscribers and releases the old connection', async () => {
  const name = crypto.randomUUID()
  const store = createStore(name)
  const query = store.query((rows) => rows)
  const stop = query.subscribe(() => {})
  try {
    await expect.poll(() => query.snapshot().status).toBe('ready')
    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 2)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    upgraded.close()
    expect(query.snapshot().status).toBe('error')
    await expect(query.read()).rejects.toThrow('changed in another connection')
  } finally {
    stop()
    store.close()
    await deleteDatabase(name)
  }
})

it('rejects a blocked upgrade and closes its eventual connection', async () => {
  const name = crypto.randomUUID()
  const blocker = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const store = createIndexedDbStore({
    name,
    version: 2,
    store: 'items',
    keyPath: 'id',
    indexes: [],
    decode: (value) => schema.parse(value),
    keyOf: (row) => row.id,
  })
  try {
    await expect(store.query((rows) => rows).read()).rejects.toThrow('blocked')
  } finally {
    blocker.close()
    store.close()
    await deleteDatabase(name)
  }
})

it('notifies a subscribed query in a separate browsing context after commit', async () => {
  const name = crypto.randomUUID()
  const writer = indexedDbRecovery(name)
  const frame = document.createElement('iframe')
  const observed: unknown[] = []
  const receive = (event: MessageEvent) => {
    if (
      event.source === frame.contentWindow &&
      event.origin === location.origin &&
      event.data?.fixture === name
    )
      observed.push(event.data.state)
  }
  window.addEventListener('message', receive)
  frame.src = `/tests/helpers/queryObserver.html?database=${encodeURIComponent(name)}`
  document.body.append(frame)
  const record = {
    id: 'a',
    actor: 'writer',
    name: 'file.md',
    text: 'Cross-context',
    revision: 1,
    updatedAt: 1,
  }
  try {
    await expect.poll(() => observed.at(-1)).toEqual({ status: 'ready', value: [] })
    await writer.put(record)
    await expect.poll(() => observed.at(-1)).toEqual({ status: 'ready', value: [record] })
  } finally {
    window.removeEventListener('message', receive)
    frame.remove()
    writer.close()
    await deleteDatabase(name)
  }
})

it('rejects malformed persisted rows at the read boundary', async () => {
  const name = crypto.randomUUID()
  const raw = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () =>
      request.result
        .createObjectStore('items', { keyPath: 'id' })
        .put({ id: 'a', value: 'invalid' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  raw.close()
  const store = createStore(name)
  try {
    await expect(store.query((rows) => rows).read()).rejects.toThrow()
    await expect(store.update('a', () => ({ id: 'a', value: 1 }))).rejects.toThrow()
  } finally {
    store.close()
    await deleteDatabase(name)
  }
})
