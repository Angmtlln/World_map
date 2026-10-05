// What survives a page reload: the account (to hint Google which one to use when the
// token has to be renewed) and the access token until it expires (about an hour).
// There is no refresh token in the browser flow, so after expiry the user taps once.

export interface DriveSession {
  email: string
  folderId: string
  accessToken: string | null
  expiresAt: number
}

const KEY = 'driveSession'
// Treat the token as expired a little early, so a request never starts with seconds left.
export const EXPIRY_MARGIN_MS = 60_000

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function storage(): KeyValueStore | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

export function loadSession(store = storage()): DriveSession | null {
  try {
    const raw = store?.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<DriveSession>
    if (typeof s.email !== 'string' || typeof s.folderId !== 'string') return null
    return {
      email: s.email,
      folderId: s.folderId,
      accessToken: typeof s.accessToken === 'string' ? s.accessToken : null,
      expiresAt: typeof s.expiresAt === 'number' ? s.expiresAt : 0,
    }
  } catch {
    return null
  }
}

export function saveSession(session: DriveSession, store = storage()): void {
  try {
    store?.setItem(KEY, JSON.stringify(session))
  } catch {
    // Without storage the session lasts until the page is closed; nothing else breaks.
  }
}

export function clearSession(store = storage()): void {
  try {
    store?.removeItem(KEY)
  } catch {
    // Nothing stored, nothing to clear.
  }
}

export function validToken(session: DriveSession | null, now = Date.now()): string | null {
  if (!session?.accessToken) return null
  return session.expiresAt - EXPIRY_MARGIN_MS > now ? session.accessToken : null
}
