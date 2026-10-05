import { describe, expect, it } from 'vitest'
import { requestPersistence } from './persist'

const storage = (persisted: boolean, granted: boolean) =>
  ({
    persisted: async () => persisted,
    persist: async () => granted,
  }) as unknown as StorageManager

describe('requestPersistence', () => {
  it('reports storage that is already persistent', async () => {
    expect(await requestPersistence(storage(true, false))).toBe('persisted')
  })

  it('asks for persistence and reports the answer', async () => {
    expect(await requestPersistence(storage(false, true))).toBe('persisted')
    expect(await requestPersistence(storage(false, false))).toBe('denied')
  })

  it('handles browsers without the Storage API', async () => {
    expect(await requestPersistence(undefined as unknown as StorageManager)).toBe('unsupported')
  })
})
