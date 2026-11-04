import type { Prompt } from '@/types'

export function SlashMenu({ items, sel, onPick }: { items: Prompt[]; sel: number; onPick: (name: string) => void }) {
  if (!items.length) return null
  return (
    <div className="slashmenu">
      {items.map((p, i) => (
        <div
          key={p.id}
          className={i === sel ? 'on' : ''}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(p.name)
          }}
        >
          <b>/{p.name}</b> <span className="muted">{p.text.slice(0, 70)}</span>
        </div>
      ))}
    </div>
  )
}
