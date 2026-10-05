import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from './i18n'
import { loadWorld, type World } from './map/geo'
import { WorldMap } from './map/WorldMap'
import { PersistHint } from './PersistHint'
import { useAddPhotos } from './photos/useAddPhotos'
import { useCoverImages } from './photos/useCoverImages'
import { useTerritoryPhotos } from './photos/useTerritoryPhotos'
import { openPhotoDb, type PhotoDb } from './storage/db'
import { isSafariInBrowser, requestPersistence } from './storage/persist'
import { TerritoryPanel } from './TerritoryPanel'

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; world: World }

const HINT_DISMISSED_KEY = 'persistHintDismissed'

function hintDismissed(): boolean {
  try {
    return localStorage.getItem(HINT_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export default function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [db, setDb] = useState<PhotoDb | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [photosVersion, setPhotosVersion] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [hiRes, setHiRes] = useState<ReadonlySet<string>>(() => new Set())
  const persistenceAsked = useRef(false)

  useEffect(() => {
    loadWorld().then(
      (world) => setState({ status: 'ready', world }),
      (error: unknown) => {
        console.error(error)
        setState({ status: 'error' })
      },
    )
    // If this fails (e.g. some private modes), adding photos explains why.
    openPhotoDb().then(setDb, (error: unknown) => console.error(error))
  }, [])

  // Ask for persistent storage once there is something worth keeping.
  async function afterSave() {
    setPhotosVersion((v) => v + 1)
    if (persistenceAsked.current) return
    persistenceAsked.current = true
    const persistence = await requestPersistence()
    if (persistence !== 'persisted' && isSafariInBrowser() && !hintDismissed()) setShowHint(true)
  }

  function dismissHint() {
    setShowHint(false)
    try {
      localStorage.setItem(HINT_DISMISSED_KEY, '1')
    } catch {
      // Not remembering the dismissal only means the hint shows again next visit.
    }
  }

  const photos = useTerritoryPhotos(db, selectedId, photosVersion)
  const covers = useCoverImages(db, photosVersion, hiRes)
  const adding = useAddPhotos(db, () => void afterSave())

  const selected = useMemo(() => {
    if (state.status !== 'ready' || !selectedId) return null
    const all = [...state.world.countries, ...state.world.regions]
    return all.find((f) => f.properties.id === selectedId)?.properties ?? null
  }, [state, selectedId])

  return (
    <main className="app">
      {state.status === 'loading' && <p className="app-status">{t('loading')}</p>}
      {state.status === 'error' && <p className="app-status">{t('loadError')}</p>}
      {state.status === 'ready' && (
        <WorldMap
          world={state.world}
          selectedId={selectedId}
          covers={covers}
          onSelect={setSelectedId}
          onHiResChange={setHiRes}
        />
      )}
      {selected && (
        <TerritoryPanel
          territory={selected}
          photos={photos}
          progress={adding.progress}
          errors={adding.errors}
          busy={adding.busy}
          onAddFiles={(files) => void adding.add(selected.id, files)}
          onClose={() => setSelectedId(null)}
        />
      )}
      {showHint && <PersistHint onDismiss={dismissHint} />}
    </main>
  )
}
