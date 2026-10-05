import { useEffect, useMemo, useRef, useState } from 'react'
import { CropEditor } from './crop/CropEditor'
import { SyncButton } from './drive/SyncButton'
import { useDrive } from './drive/useDrive'
import { ConfirmDialog } from './gallery/ConfirmDialog'
import { coverFirst } from './gallery/order'
import { PhotoGrid } from './gallery/PhotoGrid'
import { PhotoViewer } from './gallery/PhotoViewer'
import { t, territoryName } from './i18n'
import { loadWorld, type World } from './map/geo'
import { WorldMap } from './map/WorldMap'
import { Notice } from './Notice'
import { useAddPhotos } from './photos/useAddPhotos'
import { useCoverImages } from './photos/useCoverImages'
import { useTerritoryPhotos } from './photos/useTerritoryPhotos'
import {
  deletePhoto,
  openPhotoDb,
  setCover,
  updateCrop,
  type Crop,
  type ImageSize,
  type PhotoDb,
} from './storage/db'
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
  const [imageSizes, setImageSizes] = useState<ReadonlyMap<string, ImageSize>>(() => new Map())
  // Gallery layers, bottom to top: grid, viewer, crop editor, delete confirmation.
  // The viewer follows a photo by id: making a photo the cover reorders the list.
  const [gridOpen, setGridOpen] = useState(false)
  const [viewerPhotoId, setViewerPhotoId] = useState<string | null>(null)
  const [cropPhotoId, setCropPhotoId] = useState<string | null>(null)
  const [deletePhotoId, setDeletePhotoId] = useState<string | null>(null)
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

  const reloadPhotos = () => setPhotosVersion((v) => v + 1)

  // Ask for persistent storage once there is something worth keeping.
  async function afterSave() {
    reloadPhotos()
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

  function select(id: string | null) {
    setSelectedId(id)
    setGridOpen(false)
    setViewerPhotoId(null)
    setCropPhotoId(null)
    setDeletePhotoId(null)
  }

  const drive = useDrive()
  const territoryPhotos = useTerritoryPhotos(db, selectedId, photosVersion)
  const covers = useCoverImages(db, photosVersion, imageSizes)
  const adding = useAddPhotos(db, () => void afterSave())

  const featuresById = useMemo(() => {
    if (state.status !== 'ready') return new Map()
    const all = [...state.world.countries, ...state.world.regions]
    return new Map(all.map((f) => [f.properties.id, f]))
  }, [state])
  const selectedFeature = (selectedId && featuresById.get(selectedId)) || null
  const selected = selectedFeature?.properties ?? null
  const coverId = selectedId ? covers.get(selectedId)?.photoId : undefined
  const photos = coverFirst(territoryPhotos.photos, coverId)
  const { thumbs } = territoryPhotos
  const viewerIndex = photos.findIndex((p) => p.id === viewerPhotoId)
  const cropPhoto = photos.find((p) => p.id === cropPhotoId)

  // Escape closes only the topmost layer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (deletePhotoId) setDeletePhotoId(null)
      else if (cropPhotoId) setCropPhotoId(null)
      else if (viewerPhotoId) setViewerPhotoId(null)
      else if (gridOpen) setGridOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deletePhotoId, cropPhotoId, viewerPhotoId, gridOpen])

  async function saveCrop(photoId: string, crop: Crop | null) {
    setCropPhotoId(null)
    if (!db) return
    await updateCrop(db, photoId, crop)
    reloadPhotos()
  }

  async function makeCover(photoId: string) {
    if (!db || !selectedId) return
    await setCover(db, selectedId, photoId)
    reloadPhotos()
  }

  async function confirmDelete(photoId: string) {
    setDeletePhotoId(null)
    if (!db) return
    // Keep the viewer open on a neighbour, or close it with the last photo.
    if (viewerPhotoId === photoId) {
      const i = photos.findIndex((p) => p.id === photoId)
      setViewerPhotoId((photos[i + 1] ?? photos[i - 1])?.id ?? null)
    }
    await deletePhoto(db, photoId)
    reloadPhotos()
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
          onSelect={select}
          onImageSizesChange={setImageSizes}
        />
      )}
      {selected && (
        <TerritoryPanel
          territory={selected}
          photos={photos}
          thumbs={thumbs}
          coverId={coverId}
          progress={adding.progress}
          errors={adding.errors}
          busy={adding.busy}
          onAddFiles={(files) => void adding.add(selected.id, files)}
          onEditCrop={coverId ? () => setCropPhotoId(coverId) : undefined}
          onOpenPhoto={(i) => setViewerPhotoId(photos[i].id)}
          onShowAll={() => setGridOpen(true)}
          onClose={() => select(null)}
        />
      )}
      {gridOpen && selected && (
        <PhotoGrid
          title={territoryName(selected)}
          photos={photos}
          coverId={coverId}
          thumbs={thumbs}
          onOpen={(i) => setViewerPhotoId(photos[i].id)}
          onClose={() => setGridOpen(false)}
        />
      )}
      {db && viewerIndex >= 0 && (
        <PhotoViewer
          db={db}
          photos={photos}
          index={viewerIndex}
          coverId={coverId}
          thumbs={thumbs}
          active={!cropPhotoId && !deletePhotoId}
          onIndexChange={(i) => setViewerPhotoId(photos[i].id)}
          onClose={() => setViewerPhotoId(null)}
          onMakeCover={(photo) => void makeCover(photo.id)}
          onEditCrop={(photo) => setCropPhotoId(photo.id)}
          onDelete={(photo) => setDeletePhotoId(photo.id)}
        />
      )}
      {db && selectedFeature && cropPhoto && (
        <CropEditor
          db={db}
          feature={selectedFeature}
          photo={{
            photoId: cropPhoto.id,
            href: thumbs.get(cropPhoto.id) ?? '',
            crop: cropPhoto.crop,
            width: cropPhoto.width,
            height: cropPhoto.height,
          }}
          onCancel={() => setCropPhotoId(null)}
          onSave={(crop) => void saveCrop(cropPhoto.id, crop)}
        />
      )}
      {deletePhotoId && (
        <ConfirmDialog
          title={t('deleteConfirmTitle')}
          text={t('deleteConfirmText')}
          confirmLabel={t('deletePhoto')}
          onConfirm={() => void confirmDelete(deletePhotoId)}
          onCancel={() => setDeletePhotoId(null)}
        />
      )}
      <SyncButton
        status={drive.status}
        onConnect={() => void drive.connect()}
        onSignOut={() => void drive.signOut()}
      />
      <div className="app-notices">
        {showHint && (
          <Notice
            text={t('persistHint')}
            actions={[{ label: t('dismiss'), onClick: dismissHint }]}
          />
        )}
      </div>
    </main>
  )
}
