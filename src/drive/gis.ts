// Google Identity Services, token model: the browser gets a short-lived access token
// through a Google popup. No backend, no refresh token.

import { CLIENT_ID, SCOPE } from './config'

const SCRIPT_URL = 'https://accounts.google.com/gsi/client'

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: { type: string; message?: string }) => void
  }): TokenClient
  revoke(token: string, done?: () => void): void
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth2 } }
  }
}

let loading: Promise<GoogleOAuth2> | null = null

function loadGis(): Promise<GoogleOAuth2> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2)
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () =>
      window.google?.accounts?.oauth2
        ? resolve(window.google.accounts.oauth2)
        : reject(new Error('Google Identity Services did not load'))
    script.onerror = () => {
      loading = null
      reject(new Error('Could not load Google Identity Services'))
    }
    document.head.append(script)
  })
  return loading
}

// Load the library ahead of the first tap: the popup must open within the click handler,
// or browsers block it.
export function preloadGis(): void {
  void loadGis().catch(() => {})
}

export class PopupClosedError extends Error {}

export interface Token {
  accessToken: string
  expiresAt: number
}

// Must be called from a click or tap: it opens Google's popup. With a hint of a known
// account and an earlier consent, the popup closes by itself almost at once.
export async function requestToken(hint?: string): Promise<Token> {
  const oauth2 = await loadGis()
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new Error(r.error_description ?? r.error ?? 'No access token'))
          return
        }
        resolve({
          accessToken: r.access_token,
          expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000,
        })
      },
      error_callback: (e) =>
        reject(e.type === 'popup_closed' ? new PopupClosedError() : new Error(e.message ?? e.type)),
    })
    client.requestAccessToken({ prompt: '', login_hint: hint })
  })
}

export async function revokeToken(token: string): Promise<void> {
  const oauth2 = await loadGis()
  await new Promise<void>((resolve) => oauth2.revoke(token, resolve))
}
