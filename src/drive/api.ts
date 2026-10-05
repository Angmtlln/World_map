// A thin client for the parts of the Drive REST API the app uses.

const API = 'https://www.googleapis.com/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

// The token expired or was revoked: the user has to renew it with a tap.
export class AuthError extends Error {}

export class DriveError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Fetch = typeof fetch

export async function driveFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {},
  fetchImpl: Fetch = fetch,
): Promise<T> {
  const res = await fetchImpl(`${API}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new AuthError('Access token expired or revoked')
  if (!res.ok) throw new DriveError(res.status, `Drive API ${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

export interface Account {
  email: string
  name: string
}

export async function getAccount(token: string, fetchImpl?: Fetch): Promise<Account> {
  const { user } = await driveFetch<{ user: { emailAddress: string; displayName: string } }>(
    token,
    '/about?fields=user(emailAddress,displayName)',
    {},
    fetchImpl,
  )
  return { email: user.emailAddress, name: user.displayName }
}

// Drive search syntax wants quotes and backslashes escaped inside string literals.
const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

// The app's folder in My Drive, created on first use. With the drive.file scope the
// search only sees folders this app made, so a same-named folder of the user's own
// is never picked up by mistake.
export async function ensureFolder(token: string, name: string, fetchImpl?: Fetch) {
  const q = `name = ${quote(name)} and mimeType = '${FOLDER_MIME}' and trashed = false`
  const found = await driveFetch<{ files: { id: string }[] }>(
    token,
    `/files?q=${encodeURIComponent(q)}&fields=files(id)&orderBy=createdTime&pageSize=1`,
    {},
    fetchImpl,
  )
  if (found.files.length) return found.files[0].id
  const created = await driveFetch<{ id: string }>(
    token,
    '/files?fields=id',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
    },
    fetchImpl,
  )
  return created.id
}
