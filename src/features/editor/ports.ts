export type SelectionTarget = Readonly<{
  from: number
  to: number
  text: string
  revision: number
  documentId: string
}>
export type EditorPort = {
  captureSelection(): SelectionTarget | null
  applyReplacement(target: SelectionTarget, text: string): boolean
}
