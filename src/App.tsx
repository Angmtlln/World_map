import { useEffect, useMemo, useState } from 'react'
import { t } from './i18n'
import { loadWorld, type World } from './map/geo'
import { WorldMap } from './map/WorldMap'
import { SelectionBar } from './SelectionBar'

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; world: World }

export default function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    loadWorld().then(
      (world) => setState({ status: 'ready', world }),
      (error: unknown) => {
        console.error(error)
        setState({ status: 'error' })
      },
    )
  }, [])

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
        <WorldMap world={state.world} selectedId={selectedId} onSelect={setSelectedId} />
      )}
      {selected && <SelectionBar territory={selected} onClose={() => setSelectedId(null)} />}
    </main>
  )
}
