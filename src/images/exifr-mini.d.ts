// The mini build (JPEG, EXIF and GPS only) has the same API as the full package.
declare module 'exifr/dist/mini.esm.mjs' {
  import exifr from 'exifr'
  export default exifr
}
