// Without persistent storage the browser may evict our data: Safari wipes it after
// 7 days without a visit unless the site is on the home screen. Until photos are
// synced to Google Drive (stage 3), that would lose them.

export type Persistence = 'persisted' | 'denied' | 'unsupported'

export async function requestPersistence(storage = navigator.storage): Promise<Persistence> {
  if (!storage?.persist || !storage.persisted) return 'unsupported'
  if (await storage.persisted()) return 'persisted'
  // Firefox asks the user; Chrome and Safari decide silently from site engagement or
  // home screen install. Call this after the user saves something, not on page load.
  return (await storage.persist()) ? 'persisted' : 'denied'
}

// Safari (iOS and macOS) evicts storage of sites that are not installed; a home screen
// install is the only reliable fix there. Other browsers evict only under disk pressure.
export function isSafariInBrowser(
  userAgent = navigator.userAgent,
  standalone = matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true,
): boolean {
  const safari =
    /Safari\//.test(userAgent) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Android/.test(userAgent)
  return safari && !standalone
}
