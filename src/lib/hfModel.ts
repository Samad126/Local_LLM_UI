/**
 * Normalize a pull target. Ollama can pull GGUF repos from Hugging Face as
 * `hf.co/<user>/<repo>[:<quant>]`; accept pasted HF URLs and `huggingface.co/` prefixes too.
 * Anything else (plain Ollama names) is returned unchanged.
 */
export function normalizePullName(input: string): string {
  const s = input.trim()
  const m = s.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:huggingface\.co|hf\.co)\/([^/\s?#]+)\/([^/\s?#:]+)(?:\/[^\s?#]*)?(?:[?#]\S*)?(:[\w.-]+)?$/i,
  )
  if (!m) return s
  return `hf.co/${m[1]}/${m[2]}${m[3] ?? ''}`
}

/** Split user input into distinct pull targets (whitespace or comma separated). */
export function splitPullNames(input: string): string[] {
  return [...new Set(input.split(/[\s,]+/).filter(Boolean))]
}
