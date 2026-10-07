export type ReaderPreferences = { wrapCode: boolean };

export function saveReaderPreferences(preferences: ReaderPreferences): void {
  try {
    document.cookie = `briotap-wrap-code=${preferences.wrapCode}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    /* Keep the reader usable when cookies are disabled. */
  }
}
