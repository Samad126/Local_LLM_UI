export const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0'

export const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')

export const strip = (s: string) =>
  decode(s.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()

export interface Hit {
  title: string
  url: string
  snippet: string
}
