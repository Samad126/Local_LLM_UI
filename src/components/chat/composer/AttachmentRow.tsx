import { Icon } from '@/components/common/Icon'
import { AttachCard } from '@/components/common/AttachCard'
import { useLightbox } from '@/stores/lightboxStore'
import type { Attachment } from '@/types'

interface Props {
  docs: Attachment[]
  images: string[]
  onRemoveDoc: (i: number) => void
  onRemoveImage: (i: number) => void
}

export function AttachmentRow({ docs, images, onRemoveDoc, onRemoveImage }: Props) {
  const openImage = useLightbox((s) => s.open)
  if (!docs.length && !images.length) return null
  return (
    <div className="attachrow">
      {docs.map((d, i) => (
        <AttachCard key={'d' + i} a={d} onRemove={() => onRemoveDoc(i)} />
      ))}
      {images.map((b, i) => (
        <div
          key={'i' + i}
          className="attachcard img clickable"
          onClick={() => openImage({ kind: 'image', title: `image-${i + 1}.png`, body: b })}
        >
          <img src={`data:image/png;base64,${b}`} alt="" />
          <button
            className="attachx"
            title="Remove"
            onClick={(e) => {
              e.stopPropagation()
              onRemoveImage(i)
            }}
          >
            <Icon n="x" size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
