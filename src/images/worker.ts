import { processWithMeta, type ProcessedPhoto } from './pipeline'
import { browserDeps, UnreadableImageError } from './resize'

export interface WorkerRequest {
  id: number
  file: Blob
}

export type WorkerResponse =
  | { id: number; ok: true; result: ProcessedPhoto }
  // `heic` is set when the file could not be decoded; null for any other failure.
  | { id: number; ok: false; heic: boolean | null; message: string }

// The app's tsconfig has DOM types, not WebWorker ones; a dedicated worker scope
// has the same onmessage/postMessage shape as a Worker seen from outside.
const scope = self as unknown as Worker
const deps = browserDeps()

scope.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  let response: WorkerResponse
  try {
    response = { id: data.id, ok: true, result: await processWithMeta(data.file, deps) }
  } catch (error) {
    response = {
      id: data.id,
      ok: false,
      heic: error instanceof UnreadableImageError ? error.heic : null,
      message: String(error),
    }
  }
  scope.postMessage(response)
}
