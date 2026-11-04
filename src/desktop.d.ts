interface Window {
  /** Present only inside the Electron desktop app. */
  desktop?: { pickFolder: () => Promise<string | null> }
}
