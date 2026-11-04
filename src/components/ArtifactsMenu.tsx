import { useMemo } from 'react'
import { Boxes } from 'lucide-react'
import type { Chat } from '../types'
import { chatArtifacts } from '../lib/artifacts'
import { usePreview } from '../previewStore'
import { Button } from '@/components/ui/button'

/** Top-bar toggle for the artifacts sidebar. */
export function ArtifactsMenu({ chat }: { chat: Chat }) {
  const list = usePreview((s) => s.list)
  const hasItem = usePreview((s) => !!s.item)
  const showList = usePreview((s) => s.showList)
  const close = usePreview((s) => s.close)
  const count = useMemo(() => chatArtifacts(chat).length, [chat.messages])
  if (!count) return null
  const on = list || hasItem
  return (
    <Button
      variant={on ? 'secondary' : 'ghost'}
      size="sm"
      title="Files and previews in this chat"
      onClick={() => (on ? close() : showList())}
    >
      <Boxes size={16} /> Artifacts <span className="text-muted-foreground">{count}</span>
    </Button>
  )
}
