import type { RecoveryRecord } from '../domain/document'
import type { RecoveryStore } from '../application/ports'
import { createIndexedDbStore } from '../../../shared/storage/indexedDb'
import { z } from 'zod'
const recordSchema = z.object({
  id: z.string(),
  actor: z.string(),
  name: z.string(),
  text: z.string(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.number().finite(),
  parent: z.object({ actor: z.string(), revision: z.number().int().nonnegative() }).optional(),
})
export function indexedDbRecovery(name = 'alexopwriter-web') {
  const store = createIndexedDbStore<RecoveryRecord, [string, string]>({
    name,
    version: 10,
    store: 'drafts',
    keyPath: ['id', 'actor'],
    indexes: [
      { name: 'id', keyPath: 'id' },
      { name: 'updatedAt', keyPath: 'updatedAt' },
    ],
    decode: (value) => recordSchema.parse(value),
    keyOf: (row) => [row.id, row.actor],
  })
  const drafts = store.query((rows) => rows)
  return {
    drafts,
    list: drafts.read,
    async put(record: RecoveryRecord) {
      const valid = recordSchema.parse(record)
      await store.update([valid.id, valid.actor], (previous) =>
        !previous || previous.revision <= valid.revision ? valid : undefined,
      )
    },
    close: store.close,
  } satisfies RecoveryStore & { drafts: typeof drafts }
}
