import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import type { DriveStatus } from './useDrive'
import './SyncButton.css'

interface Props {
  status: DriveStatus
  onConnect: () => void
  onSignOut: () => void
}

const CLOUD = 'M7 18a5 5 0 0 1-.9-9.92A6 6 0 0 1 17.7 7.1 4.5 4.5 0 0 1 17.5 18H7z'

function Icon({ kind }: { kind: DriveStatus['kind'] }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={CLOUD} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      {kind === 'ready' && (
        <path d="M9 13l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      )}
      {kind === 'signedOut' && <path d="M5 4l14 16" stroke="currentColor" strokeWidth="1.8" />}
      {(kind === 'paused' || kind === 'error') && (
        <path
          d="M12 9.5v3.5M12 15.2v.3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`

export function SyncButton({ status, onConnect, onSignOut }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  if (status.kind === 'off') return null

  // An expired token is renewed straight from the button: one tap, as promised.
  function handleButton() {
    if (status.kind === 'paused') onConnect()
    else setOpen((v) => !v)
  }

  const label = {
    signedOut: t('syncOff'),
    connecting: t('syncConnecting'),
    ready: t('syncOn'),
    paused: t('syncPaused'),
    error: t('syncError'),
  }[status.kind]

  return (
    <div className="sync" ref={rootRef}>
      <button
        type="button"
        className={`sync-button sync-${status.kind}`}
        onClick={handleButton}
        disabled={status.kind === 'connecting'}
        aria-label={label}
        title={label}
        aria-expanded={open}
      >
        <Icon kind={status.kind} />
      </button>
      {open && (
        <div className="sync-menu" role="dialog" aria-label={t('syncTitle')}>
          <div className="sync-menu-title">{t('syncTitle')}</div>
          {status.kind === 'signedOut' && (
            <>
              <p>{t('syncOffText')}</p>
              <button
                type="button"
                className="sync-primary"
                onClick={() => {
                  setOpen(false)
                  onConnect()
                }}
              >
                {t('signIn')}
              </button>
            </>
          )}
          {status.kind === 'ready' && (
            <>
              <p>
                {status.session.email}
                <br />
                <a href={folderUrl(status.session.folderId)} target="_blank" rel="noreferrer">
                  {t('openFolder')}
                </a>
              </p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onSignOut()
                }}
              >
                {t('signOut')}
              </button>
            </>
          )}
          {status.kind === 'error' && (
            <>
              <p>{t('syncErrorText')}</p>
              <button
                type="button"
                className="sync-primary"
                onClick={() => {
                  setOpen(false)
                  onConnect()
                }}
              >
                {t('retry')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
