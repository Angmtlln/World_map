import { useEffect, useMemo, useRef, useState } from 'react'
import { CropEditor } from './crop/CropEditor'
import { t } from './i18n'
import { loadWorld, type World } from './map/geo'
import { WorldMap } from './map/WorldMap'
import { PersistHint } from './PersistHint'
import { useAddPhotos } from './photos/useAddPhotos'
import { useCoverImages } from './photos/useCoverImages'
import { useTerritoryPhotos } from './photos/useTerritoryPhotos'
import { openPhotoDb, updateCrop, type Crop, type ImageSize, type PhotoDb } from './storage/db'
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
  const [editingCrop, setEditingCrop] = useState(false)
  const [imageSizes, setImageSizes] = useState<ReadonlyMap<string, ImageSize>>(() => new Map())
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
  const covers = useCoverImages(db, photosVersion, imageSizes)
  const adding = useAddPhotos(db, () => void afterSave())

  const selectedFeature = useMemo(() => {
    if (state.status !== 'ready' || !selectedId) return null
    const all = [...state.world.countries, ...state.world.regions]
    return all.find((f) => f.properties.id === selectedId) ?? null
  }, [state, selectedId])
  const selected = selectedFeature?.properties ?? null
  const selectedCover = selectedId ? covers.get(selectedId) : undefined

  async function saveCrop(photoId: string, crop: Crop | null) {
    setEditingCrop(false)
    if (!db) return
    await updateCrop(db, photoId, crop)
    setPhotosVersion((v) => v + 1)
  }

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
          onImageSizesChange={setImageSizes}
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
          onEditCrop={selectedCover ? () => setEditingCrop(true) : undefined}
          onClose={() => setSelectedId(null)}
        />
      )}
      {editingCrop && db && selectedFeature && selectedCover && (
        <CropEditor
          db={db}
          feature={selectedFeature}
          cover={selectedCover}
          onCancel={() => setEditingCrop(false)}
          onSave={(crop) => void saveCrop(selectedCover.photoId, crop)}
        />
      )}
      {showHint && <PersistHint onDismiss={dismissHint} />}
    </main>
  )
}
