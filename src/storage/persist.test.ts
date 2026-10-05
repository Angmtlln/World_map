import { describe, expect, it } from 'vitest'
import { isSafariInBrowser, requestPersistence } from './persist'

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

describe('isSafariInBrowser', () => {
  const iphoneSafari =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  const iphoneChrome =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1'
  const desktopChrome =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

  it('detects Safari in a browser tab', () => {
    expect(isSafariInBrowser(iphoneSafari, false)).toBe(true)
  })

  it('ignores Safari once installed to the home screen', () => {
    expect(isSafariInBrowser(iphoneSafari, true)).toBe(false)
  })

  it('ignores other browsers, including Chrome on iPhone', () => {
    expect(isSafariInBrowser(iphoneChrome, false)).toBe(false)
    expect(isSafariInBrowser(desktopChrome, false)).toBe(false)
  })
})
