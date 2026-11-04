import { Icon } from '@/components/common/Icon'
import { Button } from '@/components/ui/button'
import { faviconUrl, hostname } from '@/lib/url'
import { usePreview } from '@/stores/previewStore'

export function SourcesList() {
  const { sources: v, close } = usePreview()
  if (!v) return null
  return (
    <>
      <div className="preview-head">
        <b>Sources</b>
        <Button variant="ghost" size="icon" className="size-8" title="Close" onClick={close}>
          <Icon n="x" />
        </Button>
      </div>
      <div className="preview-doc artlist">
        {v.query && <p className="muted">Results for “{v.query}”</p>}
        {v.sources.map((s, i) => (
          <a key={i} className="srcitem" href={s.url} target="_blank" rel="noreferrer">
            <span className="srchost">
              <img src={faviconUrl(s.url)} alt="" width={16} height={16} />
              {hostname(s.url)}
            </span>
            <b>{s.title || s.url}</b>
            {s.snippet && <small>{s.snippet}</small>}
          </a>
        ))}
      </div>
    </>
  )
}
