import Dexie, { type Table } from 'dexie'
import { z } from 'zod'
const recordSchema = z.object({
  id: z.string(),
  actor: z.string(),
  name: z.string(),
  text: z.string(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.number().finite(),
  parent: z
    .object({ actor: z.string(), revision: z.number().int().nonnegative() })
    .optional(),
})
export type RecoveryRecord = z.infer<typeof recordSchema>
export type RecoveryStore = {
  list(): Promise<readonly RecoveryRecord[]>
  put(record: RecoveryRecord): Promise<void>
  close(): void
}
export function dexieRecovery(name = 'alexopwriter-web'): RecoveryStore {
  const database = new Dexie(name)
  database.version(1).stores({ drafts: '[id+actor], id, updatedAt' })
  const drafts: Table<RecoveryRecord, [string, string]> =
    database.table('drafts')
  return {
    async list() {
      const rows: unknown[] = await drafts.toArray()
      return rows.map((row) => recordSchema.parse(row))
    },
    async put(record) {
      const valid = recordSchema.parse(record)
      await database.transaction('rw', drafts, async () => {
        const previous = await drafts.get([valid.id, valid.actor])
        if (!previous || previous.revision <= valid.revision)
          await drafts.put(valid)
      })
    },
    close() {
      database.close()
    },
  }
}
