import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react'
import { Icon } from '@/components/common/Icon'
import { useResizable } from '@/components/common/Resizer'
import { Markdown } from '@/components/markdown/Markdown'
import { Button } from '@/components/ui/button'
import { saveArtifact } from '@/features/artifacts/saveArtifact'
import { downloadDoc, isDocKind, type DocKind } from '@/lib/docs'
import { usePreview } from '@/stores/previewStore'
import { ArtifactList } from './ArtifactList'
import { DocBody } from './DocBody'
import { SourcesList } from './SourcesList'

export function PreviewPane() {
  const { item, list, sources, full, setFull, close, showList } = usePreview()
  const { w, handle } = useResizable('preview-w', 560, 320, 1200)
  if (!item && !list && !sources) return null
  if (sources && !item)
    return (
      <aside className="preview" style={{ width: w }}>
        {handle}
        <SourcesList />
      </aside>
    )
  if (!item)
    return (
      <aside className="preview" style={{ width: w }}>
        {handle}
        <ArtifactList />
      </aside>
    )
  const doc = isDocKind(item.kind)
  const save = () => {
    if (isDocKind(item.kind)) return downloadDoc(item.kind, item.code)
    saveArtifact(item, item.kind === 'file' || item.kind === 'image' ? item.title : undefined)
  }
  const srcDoc =
    item.kind === 'svg'
      ? `<body style="margin:0;display:grid;place-items:center;min-height:100vh">${item.code}</body>`
      : item.code
  return (
    <aside className={'preview' + (full ? ' full' : '')} style={full ? undefined : { width: w }}>
      {!full && handle}
      <div className="preview-head">
        <Button variant="ghost" size="icon" className="size-8" title="All artifacts" onClick={() => showList()}>
          <ArrowLeft size={16} />
        </Button>
        <b>{item.title}</b>
        <Button variant="ghost" size="sm" onClick={save}>
          <Icon n="download" /> Download
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title={full ? 'Exit full screen' : 'Full screen'}
          onClick={() => setFull(!full)}
        >
          {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </Button>
        <Button variant="ghost" size="icon" className="size-8" title="Close" onClick={close}>
          <Icon n="x" />
        </Button>
      </div>
      {item.kind === 'image' ? (
        <div className="preview-doc" style={{ display: 'grid', placeItems: 'center' }}>
          <img
            src={`data:image/png;base64,${item.code}`}
            alt={item.title}
            style={{ maxWidth: '100%', borderRadius: 8 }}
          />
        </div>
      ) : item.kind === 'file' ? (
        <div className="preview-doc">
          <pre className="pre" style={{ maxHeight: 'none' }}>
            {item.code}
          </pre>
        </div>
      ) : item.kind === 'html' || item.kind === 'svg' ? (
        <iframe title="Preview" sandbox="allow-scripts" srcDoc={srcDoc} />
      ) : doc ? (
        <DocBody kind={item.kind as DocKind} code={item.code} />
      ) : (
        <div className="preview-doc">
          <Markdown text={item.code} />
        </div>
      )}
    </aside>
  )
}
