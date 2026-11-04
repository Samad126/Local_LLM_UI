import { useState } from 'react'
import { Confirm } from '@/components/common/Confirm'
import { Icon } from '@/components/common/Icon'
import { timeAgo } from '@/lib/format'
import { useStore } from '@/stores/chatStore'
import type { Chat } from '@/types'

/** One row in the chat list: click to open, with pin / rename / delete actions on hover. */
export function ChatListItem({ chat, active }: { chat: Chat; active: boolean }) {
  const openChat = useStore((s) => s.openChat)
  const deleteChat = useStore((s) => s.deleteChat)
  const patchChat = useStore((s) => s.patchChat)
  const [editing, setEditing] = useState(false)

  return (
    <div className={'chatitem' + (active ? ' active' : '')} onClick={() => openChat(chat.id)}>
      {editing ? (
        <input
          autoFocus
          className="input"
          defaultValue={chat.title}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            patchChat(chat.id, () => ({ title: e.target.value || chat.title }))
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
          }}
        />
      ) : (
        <>
          <span className="title">
            {chat.pinned && <Icon n="pin" size={12} />} {chat.title}
          </span>
          <span className="when">{timeAgo(chat.updatedAt)}</span>
          <span className="acts" onClick={(e) => e.stopPropagation()}>
            <button title="Pin" onClick={() => patchChat(chat.id, () => ({ pinned: !chat.pinned }))}>
              <Icon n="pin" size={13} />
            </button>
            <button title="Rename" onClick={() => setEditing(true)}>
              <Icon n="edit" size={13} />
            </button>
            <Confirm
              title="Delete this chat?"
              description="The conversation is removed permanently."
              action="Delete"
              onConfirm={() => deleteChat(chat.id)}
            >
              <button title="Delete">
                <Icon n="trash" size={13} />
              </button>
            </Confirm>
          </span>
        </>
      )}
    </div>
  )
}
