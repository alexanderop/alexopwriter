import { expect, it } from 'vitest'
import { selectLibrary, type DocumentSnapshot } from '../src/features/documents'

function document(id: string, patch: Partial<DocumentSnapshot>): DocumentSnapshot {
  return {
    id,
    name: `${id}.md`,
    text: '',
    revision: 0,
    folder: '',
    favorite: false,
    trashedAt: null,
    updatedAt: 0,
    recoveryStatus: { kind: 'saved', revision: 0 },
    diskStatus: { kind: 'unbound' },
    hasDiskBinding: false,
    ...patch,
  }
}
const documents = [
  document('beta', { text: 'The Needle', updatedAt: 2, folder: 'Novel', favorite: true }),
  document('alpha', { updatedAt: 1 }),
  document('discarded', { trashedAt: 3, updatedAt: 3 }),
]
it('searches document names and content while excluding Trash by default', () => {
  expect(selectLibrary(documents).map((doc) => doc.id)).toEqual(['beta', 'alpha'])
  expect(selectLibrary(documents, { query: ' needle ' }).map((doc) => doc.id)).toEqual(['beta'])
  expect(selectLibrary(documents, { query: 'alpha' }).map((doc) => doc.id)).toEqual(['alpha'])
})
it('filters favorites, folders and Trash and sorts names without mutating input', () => {
  expect(selectLibrary(documents, { section: 'favorites' }).map((doc) => doc.id)).toEqual(['beta'])
  expect(selectLibrary(documents, { folder: 'Novel' }).map((doc) => doc.id)).toEqual(['beta'])
  expect(selectLibrary(documents, { section: 'trash' }).map((doc) => doc.id)).toEqual(['discarded'])
  expect(selectLibrary(documents, { sort: 'name' }).map((doc) => doc.id)).toEqual(['alpha', 'beta'])
  expect(documents.map((doc) => doc.id)).toEqual(['beta', 'alpha', 'discarded'])
})
