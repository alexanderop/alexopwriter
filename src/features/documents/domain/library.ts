import type { DocumentSnapshot } from './document'

export type LibraryQuery = {
  readonly query?: string
  readonly section?: 'all' | 'favorites' | 'trash'
  readonly folder?: string
  readonly sort?: 'updated' | 'name'
}

export function selectLibrary(documents: readonly DocumentSnapshot[], options: LibraryQuery = {}) {
  const query = options.query?.trim().toLocaleLowerCase() ?? ''
  return documents
    .filter((document) => {
      if ((document.trashedAt !== null) !== (options.section === 'trash')) return false
      if (options.section === 'favorites' && !document.favorite) return false
      if (options.folder !== undefined && document.folder !== options.folder) return false
      return `${document.name}\n${document.text}`.toLocaleLowerCase().includes(query)
    })
    .sort((first, second) => {
      const order =
        options.sort === 'name'
          ? first.name.localeCompare(second.name)
          : second.updatedAt - first.updatedAt
      return order || first.name.localeCompare(second.name) || first.id.localeCompare(second.id)
    })
}
