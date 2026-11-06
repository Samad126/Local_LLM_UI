import type { DocKind } from '@/lib/docs'

/** System-prompt text explaining how the model can produce downloadable files. */
export const FILE_HINT =
  'Answer normally in chat Markdown by default. NEVER create a file, presentation, document or spreadsheet unless the user explicitly asks for one (e.g. mentions PDF, Word, slides, PowerPoint, Excel). A question like "what is the best structure for X" gets a plain chat answer. File output: this app can turn fenced blocks into downloadable files. Only when the user explicitly asks for a document/file: for a PDF or Word document, reply with one fenced block whose language is `pdf` or `docx` containing the whole document as Markdown (start with a `# Title`; headings, lists, tables and bold/italic work). For a presentation, use language `pptx` with Markdown: separate slides with a line containing only `---`; each slide starts with `# Slide title` (the first slide is the title slide: `# Title` plus one subtitle line), then at most 5 short bullets, a table, or a few sentences; optionally add a line `Notes: …` for speaker notes. For a spreadsheet, use a fenced block with language `xlsx` containing CSV (header row first). For web pages use `html`, for images `svg`. Use plain Markdown only (no HTML tags; write math as LaTeX: $x^2$ inline, $$...$$ for display, it is typeset in the file). Never wrap the document in a second code block; add only a brief sentence outside the block.'

const FORMAT_DETAIL: Record<DocKind, string> = {
  xlsx: 'CSV content',
  pptx: 'Markdown slides separated by lines containing only ---, each starting with # Title, max 5 short bullets per slide; first slide is the title slide',
  pdf: 'Markdown content, no HTML; write math as LaTeX with $...$ inline or $$...$$ for display, it is typeset in the file',
  docx: 'Markdown content, no HTML; write math as LaTeX with $...$ inline or $$...$$ for display, it is typeset in the file',
}

/** Appended to the user's turn when they ask for a file, so even weak models use the fenced-block format. */
export const outputFormatReminder = (kind: DocKind) =>
  `\n\n[Output format: put the complete document inside ONE fenced code block whose language is \`${kind}\` (${FORMAT_DETAIL[kind]}). Work out every answer correctly BEFORE writing; the document must be clean and final, with no self-corrections or notes to yourself. Put each multiple-choice option on its own line. Outside the block write only one short sentence. Do not repeat the document in the chat.]`

export const summaryPrompt = (transcript: string) =>
  `Summarize this conversation so work can continue from the summary alone. Include: the user's goal, decisions made, files created or changed (with paths), commands run and their outcomes, errors still open, and what remains to do. Be concise (under 350 words), no preamble.\n\n${transcript}`

export const titlePrompt = (first: string) =>
  `Write a concise 3-6 word title for a chat that starts with this message. Reply with the title only, no quotes.\n\n${first}`

export const searchQueryPrompt = (convo: string) =>
  `Given this conversation, write one standalone web search query (max 12 words) for the last user message. Reply with the query only.\n\n${convo}`

export const NUDGE = 'Go ahead: call the tool now instead of describing it.'
