import { useStore } from '../store'
import { slashSegments } from '../lib/slash'

/** Text with saved-prompt `/commands` shown in blue. */
export function SlashText({ text }: { text: string }) {
  const prompts = useStore((s) => s.prompts)
  return (
    <>
      {slashSegments(
        text,
        prompts.map((p) => p.name),
      ).map((s, i) =>
        s.cmd ? (
          <span key={i} className="slashcmd">
            {s.text}
          </span>
        ) : (
          s.text
        ),
      )}
    </>
  )
}
