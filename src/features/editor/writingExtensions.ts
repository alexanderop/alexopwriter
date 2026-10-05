import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { activePassage } from './domain/passage'
import type { WritingPreferences } from './domain/preferences'

export function passageFocus(mode: WritingPreferences['focus']) {
  if (mode === 'off') return []
  const dim = Decoration.mark({ class: 'writing-dimmed' })
  function decorations(view: EditorView) {
    const selection = view.state.selection.main
    const passage = activePassage(
      view.state.doc.toString(),
      selection.head,
      mode === 'sentence' ? 'sentence' : 'paragraph',
    )
    const from = Math.min(passage.from, selection.from)
    const to = Math.max(passage.to, selection.to)
    const ranges = []
    for (const visible of view.visibleRanges) {
      if (visible.from < from) ranges.push(dim.range(visible.from, Math.min(from, visible.to)))
      if (visible.to > to) ranges.push(dim.range(Math.max(to, visible.from), visible.to))
    }
    return Decoration.set(ranges, true)
  }
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = decorations(view)
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged)
          this.decorations = decorations(update.view)
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )
}

export const typewriterScrolling = ViewPlugin.fromClass(
  class {
    constructor(private view: EditorView) {
      this.center()
    }
    update(update: ViewUpdate) {
      if (!update.selectionSet && !update.docChanged && !update.focusChanged) return
      this.center()
    }
    center() {
      this.view.requestMeasure({
        key: this,
        read: (view) => {
          if (!view.hasFocus || view.composing) return null
          const area = view.dom.closest<HTMLElement>('.writing-area')
          const caret = view.coordsAtPos(view.state.selection.main.head)
          if (!area || !caret) return null
          const bounds = area.getBoundingClientRect()
          return {
            area,
            delta: (caret.top + caret.bottom) / 2 - bounds.top - area.clientHeight / 2,
          }
        },
        write: (measurement) => {
          if (measurement) measurement.area.scrollTop += measurement.delta
        },
      })
    }
  },
)
