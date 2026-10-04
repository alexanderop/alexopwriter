import {
  shallowReadonly,
  shallowRef,
  toValue,
  watchEffect,
  type MaybeRefOrGetter,
} from 'vue'
import type { QueryAtom } from './queryAtom'

export function useQueryAtom<A>(source: MaybeRefOrGetter<QueryAtom<A>>) {
  const state = shallowRef(toValue(source).snapshot())
  watchEffect((onCleanup) => {
    const atom = toValue(source)
    state.value = atom.snapshot()
    onCleanup(
      atom.subscribe((next) => {
        state.value = next
      }),
    )
  })
  return shallowReadonly(state)
}
