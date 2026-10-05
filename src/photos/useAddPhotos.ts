import { useState } from 'react'
import { t } from '../i18n'
import { processPhoto } from '../images/processPhoto'
import { UnreadableImageError } from '../images/resize'
import { addPhoto, type PhotoDb } from '../storage/db'

export interface AddProgress {
  territoryId: string
  done: number
  total: number
}

export interface AddErrors {
  territoryId: string
  messages: string[]
}

function errorMessage(file: File, error: unknown): string {
  if (error instanceof UnreadableImageError) {
    return t(error.heic ? 'errorHeic' : 'errorUnreadable', { name: file.name })
  }
  console.error(error)
  return t('errorSave', { name: file.name })
}

// Processes and saves files one by one. `onSaved` runs after each saved photo,
// so thumbnails and map fills appear as the batch goes.
export function useAddPhotos(db: PhotoDb | null, onSaved: () => void) {
  const [progress, setProgress] = useState<AddProgress | null>(null)
  const [errors, setErrors] = useState<AddErrors | null>(null)

  async function add(territoryId: string, files: File[]) {
    if (!files.length) return
    if (!db) {
      setErrors({ territoryId, messages: [t('storageUnavailable')] })
      return
    }
    const messages: string[] = []
    setErrors(null)
    setProgress({ territoryId, done: 0, total: files.length })
    for (const [i, file] of files.entries()) {
      try {
        const { width, height, images, meta } = await processPhoto(file)
        await addPhoto(db, { territoryId, takenAt: meta.takenAt, width, height, images })
        onSaved()
      } catch (error) {
        messages.push(errorMessage(file, error))
      }
      setProgress({ territoryId, done: i + 1, total: files.length })
    }
    setProgress(null)
    if (messages.length) setErrors({ territoryId, messages })
  }

  return { add, progress, errors, busy: progress !== null }
}
