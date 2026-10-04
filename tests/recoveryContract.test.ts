import { recoveryContract } from './support/recoveryContract'
import { memoryRecovery } from './support/workspace'
recoveryContract(() => ({ store: memoryRecovery(), async cleanup() {} }))
