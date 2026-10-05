/// <reference types="vite/client" />

interface ImportMetaEnv {
  // OAuth client id from Google Cloud; empty disables Drive sync.
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
