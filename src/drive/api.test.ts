import { describe, expect, it, vi } from 'vitest'
import { AuthError, DriveError, ensureFolder, getAccount } from './api'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('getAccount', () => {
  it('sends the token and reads the account', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ user: { emailAddress: 'me@example.com', displayName: 'Me' } }),
    )
    expect(await getAccount('tok', fetchImpl)).toEqual({ email: 'me@example.com', name: 'Me' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/about?')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('turns 401 into AuthError and other failures into DriveError', async () => {
    await expect(getAccount('tok', async () => json({}, 401))).rejects.toBeInstanceOf(AuthError)
    await expect(getAccount('tok', async () => json({}, 500))).rejects.toBeInstanceOf(DriveError)
  })
})

describe('ensureFolder', () => {
  it('reuses the existing folder', async () => {
    const fetchImpl = vi.fn(async () => json({ files: [{ id: 'f1' }] }))
    expect(await ensureFolder('tok', 'Фотокарта мира', fetchImpl)).toBe('f1')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url] = fetchImpl.mock.calls[0] as unknown as [string]
    expect(decodeURIComponent(url)).toContain("name = 'Фотокарта мира'")
  })

  it('creates the folder when there is none', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ files: [] }))
      .mockResolvedValueOnce(json({ id: 'new' }))
    expect(await ensureFolder('tok', 'Фотокарта мира', fetchImpl)).toBe('new')
    const [, init] = fetchImpl.mock.calls[1] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Фотокарта мира',
      mimeType: 'application/vnd.google-apps.folder',
    })
  })

  it('escapes quotes in the folder name', async () => {
    const fetchImpl = vi.fn(async () => json({ files: [{ id: 'f1' }] }))
    await ensureFolder('tok', "O'Brien", fetchImpl)
    const [url] = fetchImpl.mock.calls[0] as unknown as [string]
    expect(decodeURIComponent(url)).toContain("name = 'O\\'Brien'")
  })
})
