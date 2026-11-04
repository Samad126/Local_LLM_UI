import { memo, useState } from 'react'
import { Icon } from '@/components/common/Icon'
import { Button } from '@/components/ui/button'
import { lineDiff } from '@/lib/diff'
import { useStore } from '@/stores/chatStore'
import type { ToolCall } from '@/types'

function Diff({ a, b }: { a: string; b: string }) {
  const rows = lineDiff(a, b)
  const add = rows.filter((r) => r.t === '+').length,
    del = rows.filter((r) => r.t === '-').length
  let o = 0,
    n = 0
  return (
    <div className="diffbox">
      <div className="diffstat">
        <span className="add">+{add}</span> <span className="del">−{del}</span>
      </div>
      <pre className="diff">
        {rows.map((r, k) => {
          if (r.t !== '+') o++
          if (r.t !== '-') n++
          return (
            <div key={k} className={'dl ' + (r.t === '+' ? 'add' : r.t === '-' ? 'del' : 'ctx')}>
              <span className="ln">{r.t === '+' ? '' : o}</span>
              <span className="ln">{r.t === '-' ? '' : n}</span>
              <span className="sg">{r.t}</span>
              {r.s || ' '}
            </div>
          )
        })}
      </pre>
    </div>
  )
}

const APPROVED: Record<string, string> = { auto: 'auto-approved', user: 'allowed', always: 'always allowed' }

export const ToolCard = memo(function ToolCard({ tc }: { tc: ToolCall }) {
  const approve = useStore((s) => s.approve)
  const [open, setOpen] = useState(tc.status === 'pending')
  // Pending calls pop open so the user sees what they are approving.
  if (tc.status === 'pending' && !open) setOpen(true)
  const label =
    tc.status === 'running' ? 'running…' : tc.status === 'done' && tc.approved ? APPROVED[tc.approved] : tc.status
  return (
    <details className={'toolcall ' + tc.status} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <Icon n={tc.name === 'run_command' ? 'terminal' : 'folder'} size={14} />
        <b>{tc.name}</b>
        <span className="muted toolarg">{tc.args.command ?? tc.args.path ?? tc.args.pattern ?? ''}</span>
        <span className="toolstatus">{label}</span>
      </summary>
      {open && (
        <div className="toolbody">
          {tc.name === 'edit_file' ? (
            <Diff a={String(tc.args.old_string ?? '')} b={String(tc.args.new_string ?? '')} />
          ) : tc.name === 'write_file' ? (
            <pre>{String(tc.args.content ?? '').slice(0, 4000)}</pre>
          ) : tc.name === 'run_command' ? (
            <pre>$ {String(tc.args.command ?? '')}</pre>
          ) : null}
          {tc.result && <pre className="toolresult">{tc.result.slice(0, 4000)}</pre>}
        </div>
      )}
      {tc.status === 'pending' && (
        <div className="row toolapprove">
          <Button variant="default" size="sm" onClick={() => approve(tc.id, 'allow')}>
            Allow
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => approve(tc.id, 'always')}
            title="Stop asking for this tool until you change mode"
          >
            Allow always
          </Button>
          <Button variant="outline" size="sm" onClick={() => approve(tc.id, 'deny')}>
            Deny
          </Button>
        </div>
      )}
    </details>
  )
})
