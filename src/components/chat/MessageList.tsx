import { Fragment } from 'react'
import { Message } from '@/components/chat/Message'
import { useStore } from '@/stores/chatStore'
import type { Chat } from '@/types'
import { useStickToBottom } from './useStickToBottom'

function CompactNote({ summary, open = false }: { summary: string; open?: boolean }) {
  return (
    <details className="compactnote" open={open}>
      <summary>Earlier messages above were compacted into a summary (the model no longer sees them)</summary>
      <p>{summary}</p>
    </details>
  )
}

/** The scrolling transcript: offline banner, empty state, messages and the "compacted" marker. */
export function MessageList({ chat }: { chat: Chat }) {
  const streamingId = useStore((s) => s.streamingId)
  const online = useStore((s) => s.online)
  const tail = chat.messages[chat.messages.length - 1]
  const tailKey = `${chat.messages.length}:${tail?.content.length}:${tail?.thinking?.length}:${tail?.toolCalls?.length}`
  const { ref, handlers } = useStickToBottom(chat.id, tailKey)
  const summaryAt = chat.summaryCount ?? 0

  return (
    <div className="scroller" ref={ref} {...handlers}>
      {online === false && (
        <div className="banner bad">
          Can't reach Ollama. Start it with <code>ollama serve</code> or check the host in App settings.
        </div>
      )}
      {chat.messages.length === 0 ? (
        <div className="empty">
          <h1>What can I help with?</h1>
          <p className="muted">{chat.settings.model || 'Pick a model in Settings'} · runs fully on your machine</p>
        </div>
      ) : (
        <div className="messages">
          {chat.messages.map((msg, i) => (
            <Fragment key={msg.id}>
              {chat.summary && i === summaryAt && <CompactNote summary={chat.summary} />}
              <Message
                msg={msg}
                streaming={streamingId === chat.id && i === chat.messages.length - 1}
                isLast={i === chat.messages.length - 1}
                ask={chat.messages[i - 1]?.role === 'user' ? chat.messages[i - 1].content : ''}
              />
            </Fragment>
          ))}
          {chat.summary && summaryAt >= chat.messages.length && <CompactNote summary={chat.summary} open />}
        </div>
      )}
    </div>
  )
}
