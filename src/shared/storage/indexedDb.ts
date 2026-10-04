import { createQueryAtom, type QueryAtom } from './queryAtom'

export type IndexedDbStoreOptions<Row, Key extends IDBValidKey> = {
  readonly name: string
  readonly version: number
  readonly store: string
  readonly keyPath: string | string[]
  readonly indexes: readonly {
    readonly name: string
    readonly keyPath: string | string[]
  }[]
  readonly decode: (value: unknown) => Row
  readonly keyOf: (row: Row) => Key
}

export function createIndexedDbStore<Row, Key extends IDBValidKey>(
  options: IndexedDbStoreOptions<Row, Key>,
) {
  let connection: IDBDatabase | undefined
  let opening: Promise<IDBDatabase> | undefined
  let rejectOpening: ((error: Error) => void) | undefined
  let closed: Error | undefined
  const transactions = new Set<IDBTransaction>()
  const observers = new Set<(error?: Error) => void>()
  const channel =
    typeof BroadcastChannel === 'undefined'
      ? undefined
      : new BroadcastChannel(
          JSON.stringify(['alexopwriter-idb', options.name, options.store]),
        )

  function invalidate(error?: Error) {
    for (const observer of observers) observer(error)
  }
  if (channel)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data
      if (
        data !== null &&
        typeof data === 'object' &&
        'type' in data &&
        data.type === 'committed'
      )
        invalidate()
    }
  function revalidate() {
    invalidate()
  }

  function close(error = new Error('IndexedDB store is closed.')) {
    if (closed) return
    closed = error
    rejectOpening?.(error)
    for (const transaction of transactions) {
      try {
        transaction.abort()
      } catch {
        /* A completed transaction cannot be aborted. */
      }
    }
    connection?.close()
    channel?.close()
    globalThis.removeEventListener('focus', revalidate)
    globalThis.removeEventListener('pageshow', revalidate)
    invalidate(error)
    observers.clear()
  }

  function open(): Promise<IDBDatabase> {
    if (closed) return Promise.reject(closed)
    if (opening) return opening
    opening = new Promise((resolve, reject) => {
      rejectOpening = reject
      const request = indexedDB.open(options.name, options.version)
      request.onupgradeneeded = () => {
        if (closed) {
          request.transaction?.abort()
          return
        }
        const database = request.result
        if (!database.objectStoreNames.contains(options.store)) {
          const store = database.createObjectStore(options.store, {
            keyPath: options.keyPath,
          })
          for (const index of options.indexes)
            store.createIndex(index.name, index.keyPath)
        }
      }
      request.onerror = () =>
        reject(request.error ?? new Error('Could not open IndexedDB.'))
      request.onblocked = () =>
        close(new Error('IndexedDB upgrade is blocked by another connection.'))
      request.onsuccess = () => {
        const database = request.result
        if (closed) {
          database.close()
          reject(closed)
          return
        }
        try {
          const transaction = database.transaction(options.store, 'readonly')
          const store = transaction.objectStore(options.store)
          if (
            store.autoIncrement ||
            JSON.stringify(store.keyPath) !== JSON.stringify(options.keyPath)
          )
            throw new Error('Unexpected IndexedDB key path.')
          for (const index of options.indexes) {
            if (
              !store.indexNames.contains(index.name) ||
              store.index(index.name).unique ||
              store.index(index.name).multiEntry ||
              JSON.stringify(store.index(index.name).keyPath) !==
                JSON.stringify(index.keyPath)
            )
              throw new Error('Unexpected IndexedDB index schema.')
          }
          connection = database
          database.onversionchange = () =>
            close(
              new Error(
                'IndexedDB changed in another connection. Reopen the store.',
              ),
            )
          database.onclose = () =>
            close(new Error('IndexedDB connection closed unexpectedly.'))
          resolve(database)
        } catch (error) {
          database.close()
          reject(error)
        }
      }
    })
    return opening
  }

  async function transact<A>(
    mode: IDBTransactionMode,
    run: (
      store: IDBObjectStore,
      result: (value: A, changed?: boolean) => void,
      fail: (error: unknown) => void,
    ) => void,
  ): Promise<A> {
    const database = await open()
    if (closed) throw closed
    return new Promise<A>((resolve, reject) => {
      const transaction = database.transaction(options.store, mode)
      transactions.add(transaction)
      let result: { value: A; changed: boolean } | undefined
      let failure: unknown
      const fail = (error: unknown) => {
        failure = closed ?? error
        if (!closed) transaction.abort()
      }
      transaction.onabort = () => {
        transactions.delete(transaction)
        reject(
          failure ??
            closed ??
            transaction.error ??
            new Error('IndexedDB transaction aborted.'),
        )
      }
      transaction.onerror = () => {
        failure ??= transaction.error
      }
      transaction.oncomplete = () => {
        transactions.delete(transaction)
        if (!result) {
          reject(new Error('IndexedDB transaction completed without a result.'))
          return
        }
        resolve(result.value)
        if (result.changed && !closed) {
          try {
            channel?.postMessage({ type: 'committed' })
          } catch {
            // The commit is durable; focus revalidation repairs a missed notification.
          }
          invalidate()
        }
      }
      try {
        run(
          transaction.objectStore(options.store),
          (value, changed = false) => {
            result = { value, changed }
          },
          fail,
        )
      } catch (error) {
        fail(error)
      }
    })
  }

  function query<A>(select: (rows: readonly Row[]) => A): QueryAtom<A> {
    return createQueryAtom(
      () =>
        transact<readonly Row[]>('readonly', (store, result, fail) => {
          const request = store.getAll()
          request.onsuccess = () => {
            try {
              result((request.result as unknown[]).map(options.decode))
            } catch (error) {
              fail(error)
            }
          }
        }).then(select),
      (invalidateQuery) => {
        if (closed) return () => {}
        observers.add(invalidateQuery)
        if (observers.size === 1) {
          globalThis.addEventListener('focus', revalidate)
          globalThis.addEventListener('pageshow', revalidate)
        }
        return () => {
          observers.delete(invalidateQuery)
          if (!observers.size) {
            globalThis.removeEventListener('focus', revalidate)
            globalThis.removeEventListener('pageshow', revalidate)
          }
        }
      },
    )
  }

  async function update(
    key: Key,
    change: (current: Row | undefined) => Row | undefined,
  ): Promise<void> {
    await transact<void>('readwrite', (store, result, fail) => {
      const request = store.get(key)
      request.onsuccess = () => {
        try {
          const previous: unknown = request.result
          const proposed = change(
            previous === undefined ? undefined : options.decode(previous),
          )
          if (closed) throw closed
          if (proposed === undefined) {
            result(undefined)
            return
          }
          if (proposed instanceof Promise)
            throw new Error('IndexedDB updates must be synchronous.')
          const row = options.decode(proposed)
          if (indexedDB.cmp(key, options.keyOf(row)) !== 0)
            throw new Error('An IndexedDB update cannot change its key.')
          store.put(row)
          result(undefined, true)
        } catch (error) {
          fail(error)
        }
      }
    })
  }

  return { query, update, close: () => close() }
}
