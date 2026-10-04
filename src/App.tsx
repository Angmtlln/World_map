import { t } from './i18n'

export default function App() {
  return (
    <main className="app">
      <h1>{t('appTitle')}</h1>
      <p>{t('mapPlaceholder')}</p>
    </main>
  )
}
