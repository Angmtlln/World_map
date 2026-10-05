import type { ProcessedPhoto } from './pipeline'
import { UnreadableImageError } from './resize'
import type { WorkerRequest, WorkerResponse } from './worker'

// undefined: not started yet; null: unavailable, process on the main thread instead.
let worker: Worker | null | undefined
let nextId = 0
const pending = new Map<
  number,
  { resolve: (r: ProcessedPhoto) => void; reject: (e: unknown) => void }
>()

class WorkerFailedError extends Error {}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    return (worker = null)
  }
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
    const request = pending.get(data.id)
    pending.delete(data.id)
    if (!request) return
    if (data.ok) request.resolve(data.result)
    else if (data.heic !== null) request.reject(new UnreadableImageError(data.heic))
    else request.reject(new WorkerFailedError(data.message))
  }
  worker.onerror = () => {
    // The worker could not start or crashed: fail what is in flight over to the main thread.
    worker?.terminate()
    worker = null
    for (const request of pending.values()) request.reject(new WorkerFailedError('Worker crashed'))
    pending.clear()
  }
  return worker
}

function viaWorker(w: Worker, file: Blob): Promise<ProcessedPhoto> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    w.postMessage({ id, file } satisfies WorkerRequest)
  })
}

export async function processPhoto(file: Blob): Promise<ProcessedPhoto> {
  const w = getWorker()
  if (w) {
    try {
      return await viaWorker(w, file)
    } catch (error) {
      if (!(error instanceof WorkerFailedError)) throw error
      // E.g. a browser with OffscreenCanvas but no 2D context in workers.
      console.warn('Photo worker failed, processing on the main thread', error)
      worker?.terminate()
      worker = null
    }
  }
  // Loaded only when needed: the worker normally does this, and EXIF parsing is not small.
  const [{ processWithMeta }, { browserDeps }] = await Promise.all([
    import('./pipeline'),
    import('./resize'),
  ])
  return processWithMeta(file, browserDeps())
}
