import { useEffect, useState } from 'react'
import { AuthError, ensureFolder, getAccount } from './api'
import { FOLDER_NAME, isDriveConfigured } from './config'
import { PopupClosedError, preloadGis, requestToken, revokeToken } from './gis'
import {
  clearSession,
  EXPIRY_MARGIN_MS,
  loadSession,
  saveSession,
  validToken,
  type DriveSession,
} from './session'

export type DriveStatus =
  // No OAuth client configured: sync is not offered at all.
  | { kind: 'off' }
  | { kind: 'signedOut' }
  | { kind: 'connecting' }
  | { kind: 'ready'; session: DriveSession; token: string }
  // Signed in before, but the token expired: one tap renews it.
  | { kind: 'paused'; session: DriveSession }
  | { kind: 'error'; message: string; session: DriveSession | null }

function initialStatus(): DriveStatus {
  if (!isDriveConfigured()) return { kind: 'off' }
  const session = loadSession()
  if (!session) return { kind: 'signedOut' }
  const token = validToken(session)
  return token ? { kind: 'ready', session, token } : { kind: 'paused', session }
}

export function useDrive() {
  const [status, setStatus] = useState<DriveStatus>(initialStatus)

  useEffect(() => {
    if (status.kind !== 'off') preloadGis()
  }, [status.kind])

  // A stored token may have been revoked meanwhile (e.g. in the Google account settings).
  useEffect(() => {
    const initial = initialStatus()
    if (initial.kind !== 'ready') return
    getAccount(initial.token).catch((error: unknown) => {
      if (error instanceof AuthError) setStatus({ kind: 'paused', session: initial.session })
    })
  }, [])

  // Pause when the token runs out while the page is open.
  useEffect(() => {
    if (status.kind !== 'ready') return
    const timer = setTimeout(
      () => setStatus({ kind: 'paused', session: status.session }),
      Math.max(0, status.session.expiresAt - Date.now() - EXPIRY_MARGIN_MS),
    )
    return () => clearTimeout(timer)
  }, [status])

  // Sign in, or renew an expired token. Call straight from a tap: it opens Google's popup.
  async function connect() {
    const previous = status.kind === 'paused' || status.kind === 'error' ? status.session : null
    setStatus({ kind: 'connecting' })
    try {
      const { accessToken, expiresAt } = await requestToken(previous?.email)
      // Looked up every time: the user may have deleted or renamed the folder on Drive.
      const [account, folderId] = await Promise.all([
        getAccount(accessToken),
        ensureFolder(accessToken, FOLDER_NAME),
      ])
      const session: DriveSession = { email: account.email, folderId, accessToken, expiresAt }
      saveSession(session)
      setStatus({ kind: 'ready', session, token: accessToken })
    } catch (error) {
      if (error instanceof PopupClosedError) {
        setStatus(previous ? { kind: 'paused', session: previous } : { kind: 'signedOut' })
        return
      }
      console.error(error)
      setStatus({ kind: 'error', message: String(error), session: previous })
    }
  }

  async function signOut() {
    const token = status.kind === 'ready' ? status.token : null
    clearSession()
    setStatus({ kind: 'signedOut' })
    // Revoking also forgets the consent, so the next sign-in asks again: as expected
    // after signing out on purpose.
    if (token) await revokeToken(token).catch(() => {})
  }

  // For later Drive calls that find the token rejected (revoked or expired early).
  function tokenRejected() {
    if (status.kind === 'ready') setStatus({ kind: 'paused', session: status.session })
  }

  return { status, connect, signOut, tokenRejected }
}
