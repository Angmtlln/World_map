import { describe, expect, it } from 'vitest'
import {
  clearSession,
  EXPIRY_MARGIN_MS,
  loadSession,
  saveSession,
  validToken,
  type DriveSession,
} from './session'

function memoryStore() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

const session: DriveSession = {
  email: 'me@example.com',
  folderId: 'folder1',
  accessToken: 'token1',
  expiresAt: 1_000_000,
}

describe('session storage', () => {
  it('round-trips a session', () => {
    const store = memoryStore()
    saveSession(session, store)
    expect(loadSession(store)).toEqual(session)
    clearSession(store)
    expect(loadSession(store)).toBeNull()
  })

  it('ignores garbage', () => {
    const store = memoryStore()
    store.setItem('driveSession', '{not json')
    expect(loadSession(store)).toBeNull()
    store.setItem('driveSession', '{"email": 5}')
    expect(loadSession(store)).toBeNull()
  })

  it('works without storage at all', () => {
    expect(loadSession(null)).toBeNull()
    expect(() => saveSession(session, null)).not.toThrow()
  })
})

describe('validToken', () => {
  it('returns the token while it has time left', () => {
    expect(validToken(session, session.expiresAt - EXPIRY_MARGIN_MS - 1)).toBe('token1')
  })

  it('treats a token about to expire as expired', () => {
    expect(validToken(session, session.expiresAt - EXPIRY_MARGIN_MS + 1)).toBeNull()
    expect(validToken({ ...session, accessToken: null }, 0)).toBeNull()
    expect(validToken(null)).toBeNull()
  })
})
