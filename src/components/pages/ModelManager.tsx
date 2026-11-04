import { useEffect, useState } from 'react'
import type { CreateRequest } from '@/types/ollama'
import { useStore } from '@/stores/chatStore'
import { ollama, hasCap } from '@/services/ollama'
import { fmtBytes } from '@/lib/format'
import { normalizePullName, splitPullNames } from '@/lib/hfModel'
import { Icon } from '@/components/common/Icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { usePulls } from './usePulls'
import { Progress } from '@/components/ui/progress'
import { Pick } from '@/components/common/Fields'
import { Confirm } from '@/components/common/Confirm'
import { PromptDialog } from '@/components/common/PromptDialog'

export function ModelManager() {
  const { models, meta, running, refreshModels, refreshRunning } = useStore()
  const [pullName, setPullName] = useState('')
  const [detail, setDetail] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [cr, setCr] = useState({ name: '', from: '', system: '', template: '', params: '' })

  useEffect(() => {
    refreshRunning()
    const t = setInterval(refreshRunning, 4000)
    return () => clearInterval(t)
  }, [refreshRunning])

  const run = async (fn: () => Promise<unknown>) => {
    setErr('')
    try {
      await fn()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    }
  }

  const { pulls, start, cancel } = usePulls(refreshModels, setErr)

  const pull = () => {
    setErr('')
    const names = splitPullNames(pullName).map(normalizePullName)
    if (!names.length) return
    setPullName('')
    names.forEach((n) => void start(n))
  }

  const create = () =>
    run(async () => {
      const parameters: Record<string, string | number> = {}
      for (const line of cr.params.split('\n')) {
        const m = line.trim().match(/^(\w+)\s*[= ]\s*(.+)$/)
        if (m) parameters[m[1]] = isNaN(Number(m[2])) ? m[2] : Number(m[2])
      }
      const body: CreateRequest = { model: cr.name, from: cr.from }
      if (cr.system) body.system = cr.system
      if (cr.template) body.template = cr.template
      if (Object.keys(parameters).length) body.parameters = parameters
      for await (const _ of ollama.create(body)) {
        /* progress ignored */
      }
      setCr({ name: '', from: '', system: '', template: '', params: '' })
      refreshModels()
    })

  const d = detail ? meta[detail] : null

  return (
    <div className="page">
      <h2>Models</h2>
      {err && <div className="banner bad">{err}</div>}

      <section className="card">
        <h3>Pull a model</h3>
        <div className="row">
          <Input
            placeholder="e.g. qwen3:8b, hf.co/user/repo-GGUF:Q4_K_M, or a Hugging Face URL (several allowed)"
            value={pullName}
            onChange={(e) => setPullName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && pull()}
          />
          <Button variant="default" size="sm" onClick={pull}>
            Pull
          </Button>
        </div>
        {Object.entries(pulls).map(([name, p]) => (
          <div key={name} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium">{name}</span>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => cancel(name)}
              >
                Cancel
              </Button>
            </div>
            <Progress value={p.pct} />
            <span className="text-xs text-muted-foreground">
              {p.status} {p.pct ? p.pct.toFixed(0) + '%' : ''}
            </span>
          </div>
        ))}
      </section>

      <section className="card">
        <h3>Installed ({models.length})</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th>Params</th>
              <th>Quant</th>
              <th>Capabilities</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const r = running.find((x) => x.name === m.name)
              return (
                <tr key={m.name}>
                  <td>
                    <b>{m.name}</b>{' '}
                    {r && (
                      <Badge variant="secondary" className="text-ok">
                        loaded
                      </Badge>
                    )}
                  </td>
                  <td>{fmtBytes(m.size)}</td>
                  <td>{m.details.parameter_size}</td>
                  <td>{m.details.quantization_level}</td>
                  <td>
                    {meta[m.name]?.capabilities.map((c) => (
                      <Badge key={c} variant="secondary" className="mr-1">
                        {c}
                      </Badge>
                    ))}
                  </td>
                  <td className="actions">
                    <Button variant="outline" size="sm" onClick={() => setDetail(detail === m.name ? null : m.name)}>
                      Details
                    </Button>
                    {r ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          run(async () => {
                            await ollama.unload(m.name)
                            refreshRunning()
                          })
                        }
                      >
                        Unload
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          run(async () => {
                            await ollama.load(m.name)
                            refreshRunning()
                          })
                        }
                      >
                        Load
                      </Button>
                    )}
                    <PromptDialog
                      title={`Copy ${m.name}`}
                      label="New model name"
                      initial={m.name + '-copy'}
                      action="Copy"
                      onSubmit={(n) =>
                        run(async () => {
                          await ollama.copy(m.name, n)
                          refreshModels()
                        })
                      }
                    >
                      <Button variant="outline" size="sm" title="Copy model">
                        <Icon n="copy" size={14} />
                      </Button>
                    </PromptDialog>
                    <Confirm
                      title={`Delete ${m.name}?`}
                      description="The model files are removed from disk."
                      action="Delete"
                      onConfirm={() =>
                        run(async () => {
                          await ollama.delete(m.name)
                          refreshModels()
                        })
                      }
                    >
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        <Icon n="trash" size={14} />
                      </Button>
                    </Confirm>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {d && detail && (
          <div className="detail">
            <h4>{detail}</h4>
            <p className="muted">
              {hasCap(d, 'thinking') ? 'Supports thinking. ' : ''}
              {hasCap(d, 'vision') ? 'Supports images. ' : ''}
              {hasCap(d, 'tools') ? 'Supports tools. ' : ''}
              Max context: {d.contextLength?.toLocaleString() ?? 'unknown'}
            </p>
            {Object.keys(d.defaults).length > 0 && (
              <pre className="pre">
                {Object.entries(d.defaults)
                  .map(([k, v]) => `${k} ${v}`)
                  .join('\n')}
              </pre>
            )}
            <h4>Modelfile</h4>
            <pre className="pre">{d.modelfile}</pre>
          </div>
        )}
      </section>

      <section className="card">
        <h3>Running now</h3>
        {running.length === 0 ? (
          <p className="muted">Nothing loaded in memory.</p>
        ) : (
          running.map((r) => (
            <div key={r.name} className="row between">
              <span>
                <b>{r.name}</b> · {fmtBytes(r.size)} ({Math.round((r.size_vram / (r.size || 1)) * 100)}% GPU)
                {r.context_length ? ` · ctx ${r.context_length}` : ''} · expires{' '}
                {new Date(r.expires_at).toLocaleTimeString()}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  run(async () => {
                    await ollama.unload(r.name)
                    refreshRunning()
                  })
                }
              >
                Unload
              </Button>
            </div>
          ))
        )}
      </section>

      <section className="card">
        <h3>Create custom model</h3>
        <div className="grid2">
          <Input
            placeholder="New model name (e.g. my-coder)"
            value={cr.name}
            onChange={(e) => setCr({ ...cr, name: e.target.value })}
          />
          <Pick
            value={cr.from}
            placeholder="Base model…"
            onChange={(v) => setCr({ ...cr, from: v })}
            options={models.map((m) => ({ value: m.name, label: m.name }))}
          />
        </div>
        <Textarea
          rows={3}
          placeholder="System prompt (baked in)"
          value={cr.system}
          onChange={(e) => setCr({ ...cr, system: e.target.value })}
        />
        <Textarea
          className="font-mono"
          rows={3}
          placeholder={'Parameters, one per line:\ntemperature 0.2\nnum_ctx 16384'}
          value={cr.params}
          onChange={(e) => setCr({ ...cr, params: e.target.value })}
        />
        <Textarea
          className="font-mono"
          rows={2}
          placeholder="Template override (optional)"
          value={cr.template}
          onChange={(e) => setCr({ ...cr, template: e.target.value })}
        />
        <Button variant="default" size="sm" disabled={!cr.name || !cr.from} onClick={create}>
          Create
        </Button>
      </section>
    </div>
  )
}
