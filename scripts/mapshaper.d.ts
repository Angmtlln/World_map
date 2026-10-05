declare module 'mapshaper' {
  type Files = Record<string, unknown>

  const mapshaper: {
    // Runs a command string; inputs are read from `input` first, then from disk.
    // Output files are returned instead of written.
    applyCommands(commands: string, input?: Files): Promise<Record<string, string | Uint8Array>>
  }
  export default mapshaper
}
