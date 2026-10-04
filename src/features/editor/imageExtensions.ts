import { buttonClasses } from '../../shared/ui/button'
import {
  EditorState,
  Facet,
  StateEffect,
  StateField,
  type StateEffectType,
} from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import { embeddedImages } from './images'

export type PendingImagePaste = Readonly<{ id: symbol; from: number; to: number }>
export const addImagePaste = StateEffect.define<PendingImagePaste>()
export const removeImagePaste = StateEffect.define<symbol>()
export const pendingImagePastes = trackedRanges(addImagePaste, removeImagePaste)
export const addImageTarget = StateEffect.define<PendingImagePaste>()
export const removeImageTarget = StateEffect.define<symbol>()
export const imageTargets = trackedRanges(addImageTarget, removeImageTarget)

function trackedRanges(add: StateEffectType<PendingImagePaste>, remove: StateEffectType<symbol>) {
  return StateField.define<ReadonlyMap<symbol, PendingImagePaste>>({
    create: () => new Map(),
    update(pending, transaction) {
      const next = new Map<symbol, PendingImagePaste>()
      for (const [id, target] of pending) {
        let changed = false
        transaction.changes.iterChangedRanges((from, to) => {
          if (target.from === target.to && from < target.from && to > target.to) changed = true
          if (target.from !== target.to && from < target.to && to > target.from) changed = true
          if (from === to && from > target.from && from < target.to) changed = true
        })
        if (!changed)
          next.set(id, {
            id,
            from: transaction.changes.mapPos(target.from, 1),
            to: transaction.changes.mapPos(target.to, target.from === target.to ? 1 : -1),
          })
      }
      for (const effect of transaction.effects) {
        if (effect.is(add)) next.set(effect.value.id, effect.value)
        if (effect.is(remove)) next.delete(effect.value)
      }
      return next
    },
  })
}

export const imageEditAction = Facet.define<(position: number) => void>()

class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
  ) {
    super()
  }
  eq(other: ImageWidget) {
    return this.url === other.url && this.alt === other.alt
  }
  toDOM(view: EditorView) {
    const image = document.createElement('img')
    image.className = 'embedded-image'
    image.src = this.url
    image.alt = this.alt
    image.addEventListener('load', () => view.requestMeasure(), { once: true })
    const wrapper = document.createElement('span')
    wrapper.className = 'embedded-image-container'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `${buttonClasses('text')} image-alt-action`
    button.textContent = 'Edit alt text'
    button.addEventListener('click', () => {
      const position = view.posAtDOM(wrapper)
      for (const action of view.state.facet(imageEditAction)) action(position)
    })
    wrapper.append(image, button)
    return wrapper
  }
}
function decorationsFor(state: EditorState) {
  return Decoration.set(
    embeddedImages(state.doc.toString()).map((image) =>
      Decoration.replace({ widget: new ImageWidget(image.url, image.alt) }).range(
        image.from,
        image.to,
      ),
    ),
  )
}
export const imageWidgets = StateField.define({
  create: decorationsFor,
  update: (decorations, transaction) =>
    transaction.docChanged ? decorationsFor(transaction.state) : decorations,
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
})
