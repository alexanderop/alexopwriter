import { expect, it } from 'vitest'
import { createQueryAtom, type QueryState } from '../src/storage/queryAtom'

it('publishes synchronous loader failures and can refresh afterward', async () => {
  let shouldFail = true
  let invalidate: (() => void) | undefined
  let released = false
  const atom = createQueryAtom(
    () => {
      if (shouldFail) throw new Error('Cannot read yet')
      return Promise.resolve(7)
    },
    (refresh) => {
      invalidate = refresh
      return () => { released = true }
    },
  )
  const stop = atom.subscribe(() => {})
  try {
    await expect.poll(() => atom.snapshot()).toEqual({
      status: 'error',
      error: new Error('Cannot read yet'),
    })
    shouldFail = false
    invalidate?.()
    await expect.poll(() => atom.snapshot()).toEqual({ status: 'ready', value: 7 })
  } finally {
    stop()
  }
  expect(released).toBe(true)
})

it('shares refreshes and discards stale reads across invalidation and remount', async () => {
  const pending: ((value: number) => void)[] = []
  let invalidate: (() => void) | undefined
  let subscriptions = 0
  const atom = createQueryAtom(
    () => new Promise<number>((resolve) => pending.push(resolve)),
    (callback) => {
      subscriptions++
      invalidate = callback
      return () => {
        subscriptions--
      }
    },
  )
  const first: QueryState<number>[] = []
  const second: QueryState<number>[] = []
  const stop = atom.subscribe((value) => first.push(value))
  const stopSecond = atom.subscribe((value) => second.push(value))
  expect(pending).toHaveLength(1)
  expect(subscriptions).toBe(1)
  invalidate?.()
  expect(pending).toHaveLength(1)
  pending[0]?.(1)
  await Promise.resolve()
  await Promise.resolve()
  pending[1]?.(2)
  await Promise.resolve()
  expect(atom.snapshot()).toEqual({ status: 'ready', value: 2 })
  expect(second.at(-1)).toEqual({ status: 'ready', value: 2 })
  stop()
  stopSecond()
  expect(subscriptions).toBe(0)
  await Promise.resolve()
  const again = atom.subscribe((value) => first.push(value))
  expect(atom.snapshot()).toEqual({ status: 'loading' })
  pending[2]?.(3)
  await Promise.resolve()
  expect(atom.snapshot()).toEqual({ status: 'ready', value: 3 })
  again()
})

it('a fresh one-shot read neither consumes nor overwrites subscription state', async () => {
  let value = 1
  const atom = createQueryAtom(
    async () => value,
    () => () => {},
  )
  const stop = atom.subscribe(() => {})
  await Promise.resolve()
  value = 2
  expect(await atom.read()).toBe(2)
  expect(atom.snapshot()).toEqual({ status: 'ready', value: 1 })
  stop()
})

it('releases observation after a second subscriber throws during immediate delivery', () => {
  let observations = 0
  const atom = createQueryAtom(
    async () => 1,
    () => {
      observations++
      return () => {
        observations--
      }
    },
  )
  const stop = atom.subscribe(() => {})
  expect(() =>
    atom.subscribe(() => {
      throw new Error('Consumer failed')
    }),
  ).toThrow('Consumer failed')
  stop()
  expect(observations).toBe(0)
  expect(atom.snapshot()).toEqual({ status: 'loading' })
})
