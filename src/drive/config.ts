// OAuth client of the Google Cloud project. Not a secret: it ships in the page anyway;
// Google only accepts it from the origins listed in the project.
export const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

// Access only to files and folders this app created. A non-sensitive scope: no Google
// review needed, and the app cannot see anything else on the user's Drive.
export const SCOPE = 'https://www.googleapis.com/auth/drive.file'

export const FOLDER_NAME = 'Фотокарта мира'

export const isDriveConfigured = () => CLIENT_ID !== ''
