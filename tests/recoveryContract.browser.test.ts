import { indexedDbRecovery } from '../src/documents/adapters/indexedDbRecovery'
import { deleteDatabase } from './helpers/indexedDb'
import { recoveryContract } from './support/recoveryContract'
recoveryContract(() => {
  const name = `recovery-contract-${crypto.randomUUID()}`
  return { store: indexedDbRecovery(name), cleanup: () => deleteDatabase(name) }
})
