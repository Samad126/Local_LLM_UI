import type { DocKind } from '@/lib/docs'

/** Which downloadable document (if any) the user's message is asking for. */
export const fileIntent = (t: string): DocKind | null =>
  /\b(pptx?|powerpoint|slide ?deck|slideshow)\b/i.test(t) ||
  /\b(create|make|build|generate|prepare|produce|write)\b[^.?!]{0,60}\b(presentation|slides|deck)\b/i.test(t)
    ? 'pptx'
    : /\bpdf\b/i.test(t)
      ? 'pdf'
      : /\bdocx?\b|\b(ms|microsoft) word\b|\bword (doc|document|file)\b|\b(in|as|into) (a )?word\b/i.test(t)
        ? 'docx'
        : /\b(xlsx|excel|spreadsheet)\b/i.test(t)
          ? 'xlsx'
          : null
