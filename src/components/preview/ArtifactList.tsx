import { Code2, FileText, Globe, Image as ImageIcon, Table2, type LucideIcon } from 'lucide-react'
import { Icon } from '@/components/common/Icon'
import { Button } from '@/components/ui/button'
import { saveArtifact } from '@/features/artifacts/saveArtifact'
import { chatArtifacts, type Artifact } from '@/features/artifacts/artifacts'
import { downloadDoc, isDocKind } from '@/lib/docs'
import { useActive } from '@/stores/chatStore'
import { usePreview } from '@/stores/previewStore'

const ICON: Record<string, LucideIcon> = {
  file: FileText,
  image: ImageIcon,
  html: Globe,
  svg: ImageIcon,
  markdown: FileText,
  pdf: FileText,
  docx: FileText,
  xlsx: Table2,
}

export function ArtifactList() {
  const chat = useActive()
  const { open, close } = usePreview()
  const items = chat ? chatArtifacts(chat) : []
  const downloadAll = async () => {
    for (const a of items) {
      if (isDocKind(a.kind)) {
        try {
          await downloadDoc(a.kind, a.code)
        } catch {
          /* skip failed file */
        }
      } else saveArtifact(a, a.title.replace(/\s+/g, '-') + '.' + (a.kind === 'markdown' ? 'md' : a.kind))
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  return (
    <>
      <div className="preview-head">
        <b>Artifacts</b>
        <Button variant="ghost" size="sm" onClick={downloadAll} disabled={!items.length}>
          <Icon n="download" /> Download all
        </Button>
        <Button variant="ghost" size="icon" className="size-8" title="Close" onClick={close}>
          <Icon n="x" />
        </Button>
      </div>
      <div className="preview-doc artlist">
        {!items.length && <p className="muted">Nothing generated in this chat yet.</p>}
        {items.map((a: Artifact) => {
          const I = ICON[a.kind] ?? Code2
          return (
            <button key={a.id} className="artitem" onClick={() => open(a)}>
              <span className="articon">
                <I size={18} />
              </span>
              <span className="artinfo">
                <b>{a.title}</b>
                <small>
                  {a.kind === 'file'
                    ? `Uploaded · ${(a.title.split('.').pop() ?? 'file').toUpperCase()}`
                    : a.kind === 'image'
                      ? 'Uploaded · Image'
                      : isDocKind(a.kind)
                        ? `Document · ${a.kind.toUpperCase()}`
                        : a.kind === 'markdown'
                          ? 'Document · MD'
                          : `Preview · ${a.kind.toUpperCase()}`}
                </small>
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}
