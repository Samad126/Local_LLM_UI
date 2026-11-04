/** Hostname without "www.", or the input unchanged when it is not a valid URL. */
export function hostname(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}

export const faviconUrl = (u: string) => `https://www.google.com/s2/favicons?domain=${hostname(u)}&sz=32`
