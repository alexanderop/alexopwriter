export type QueryState<A> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: A }
  | { readonly status: 'error'; readonly error: Error }

export type QueryAtom<A> = {
  snapshot(): QueryState<A>
  read(): Promise<A>
  subscribe(listener: (state: QueryState<A>) => void): () => void
}

export function createQueryAtom<A>(
  load: () => Promise<A>,
  observe: (invalidate: (error?: Error) => void) => () => void,
): QueryAtom<A> {
  let state: QueryState<A> = { status: 'loading' }
  const listeners = new Set<(state: QueryState<A>) => void>()
  let release: (() => void) | undefined
  let generation = 0
  let running = false
  let dirty = false

  function read(): Promise<A> {
    try {
      return load()
    } catch (error) {
      return Promise.reject(error)
    }
  }

  function publish(next: QueryState<A>) {
    state = next
    for (const listener of listeners) {
      try {
        listener(state)
      } catch (error) {
        globalThis.reportError(error)
      }
    }
  }

  function run() {
    if (running || !dirty || !listeners.size) return
    running = true
    dirty = false
    const current = generation
    void read()
      .then(
        (value) => {
          if (generation === current && listeners.size) publish({ status: 'ready', value })
        },
        (cause) => {
          if (generation === current && listeners.size)
            publish({
              status: 'error',
              error: cause instanceof Error ? cause : new Error(String(cause)),
            })
        },
      )
      .finally(() => {
        running = false
        run()
      })
  }

  function refresh(error?: Error) {
    ++generation
    dirty = !error
    publish(error ? { status: 'error', error } : { status: 'loading' })
    run()
  }

  return {
    snapshot: () => state,
    read,
    subscribe(listener) {
      const subscriber = (value: QueryState<A>) => listener(value)
      listeners.add(subscriber)
      if (listeners.size === 1) {
        release = observe(refresh)
        refresh()
      } else {
        try {
          subscriber(state)
        } catch (error) {
          listeners.delete(subscriber)
          throw error
        }
      }
      return () => {
        listeners.delete(subscriber)
        if (!listeners.size) {
          ++generation
          dirty = false
          release?.()
          release = undefined
          state = { status: 'loading' }
        }
      }
    },
  }
}
