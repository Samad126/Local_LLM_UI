import { useState } from 'react'
import { useStore, useActive } from '../store'
import { useApp } from '../appStore'
import { OPTION_DEFS, hasCap } from '../lib/ollama'
import type { Options } from '../types'
import { Icon } from './Icon'
import { Button } from '@/components/ui/button'
import { useResizable } from './Resizer'
import { Pick, Check, Range } from './Fields'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const GROUPS = ['Sampling', 'Penalties', 'Context & output', 'Mirostat', 'Hardware']

export function SettingsPanel() {
  const { w, handle } = useResizable("drawer-w", 340, 280, 700)
  const chat = useActive()
  const { models, meta, presets, prompts, updateSettings, savePreset, deletePreset, toggleDrawer } = useStore()
  const app = useApp()
  const [open, setOpen] = useState<Record<string, boolean>>({ Sampling: true, 'Context & output': true })
  if (!chat) return null
  const s = chat.settings
  const m = meta[s.model]

  const setOpt = (k: keyof Options, v: number | boolean | undefined) => {
    const o = { ...s.options }
    if (v === undefined || (typeof v === 'number' && Number.isNaN(v))) delete o[k]
    else (o as any)[k] = v
    updateSettings({ options: o })
  }

  return (
    <aside className="drawer" style={{ width: w }}>
      {handle}
      <div className="drawer-head">
        <b>Chat settings</b>
        <Button variant="ghost" size="sm" onClick={() => toggleDrawer(false)}><Icon n="x" /></Button>
      </div>
      <div className="drawer-body">
        <label className="field">Model
          <Pick value={s.model} onChange={(v) => updateSettings({ model: v })}
            options={[...(!models.find((x) => x.name === s.model) ? [{ value: s.model, label: `${s.model || '—'} (not installed)` }] : []), ...models.map((x) => ({ value: x.name, label: x.name }))]} />
          {m && (
            <small className="muted">
              {m.capabilities.join(' · ')}{m.contextLength ? ` · max ctx ${m.contextLength.toLocaleString()}` : ''}
            </small>
          )}
        </label>

        <div className="field">Preset
          <div className="row">
            <Pick value="" placeholder="Apply preset…" options={presets.map((p) => ({ value: p.id, label: p.name }))} onChange={(id) => {
              const p = presets.find((x) => x.id === id)
              if (p) updateSettings(JSON.parse(JSON.stringify(p.settings)))
            }} />
            <Button variant="outline" size="sm" onClick={() => { const n = prompt('Preset name'); if (n) savePreset(n) }}>Save</Button>
          </div>
          {presets.length > 0 && (
            <div className="chips">{presets.map((p) => <span key={p.id} className="chip">{p.name}<button onClick={() => deletePreset(p.id)}>×</button></span>)}</div>
          )}
        </div>

        <label className="field">System prompt
          <Textarea rows={4} value={s.system} placeholder="You are a helpful assistant…" onChange={(e) => updateSettings({ system: e.target.value })} />
          {prompts.length > 0 && (
            <Pick value="" placeholder="Load from library…" options={prompts.map((p) => ({ value: p.id, label: p.name }))} onChange={(id) => { const p = prompts.find((x) => x.id === id); if (p) updateSettings({ system: p.text }) }} />
          )}
        </label>

        <label className="field">Thinking
          <Pick disabled={!hasCap(m, 'thinking')} value={s.think} onChange={(v) => updateSettings({ think: v as any })} options={[{ value: 'default', label: 'Model default' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off (faster)' }]} />
          {!hasCap(m, 'thinking') && <small className="muted">Not supported by this model</small>}
        </label>

        {GROUPS.map((g) => (
          <section key={g} className="group">
            <button className="grouphead" onClick={() => setOpen({ ...open, [g]: !open[g] })}>
              <Icon n={open[g] ? 'down' : 'right'} size={14} /> {g}
            </button>
            {open[g] && OPTION_DEFS.filter((d) => d.group === g).map((d) => {
              const val = s.options[d.key] as number | undefined
              const def = m?.defaults[d.key]
              return (
                <div key={d.key} className="opt" title={d.help}>
                  <div className="optrow">
                    <span>{d.label}</span>
                    <Input
                      className="h-7 w-24 text-right" type="number" step={d.step} value={val ?? ''}
                      placeholder={def ?? 'default'}
                      onChange={(e) => setOpt(d.key, e.target.value === '' ? undefined : Number(e.target.value))}
                    />
                    <button className="x" title="Reset to model default" disabled={val === undefined} onClick={() => setOpt(d.key, undefined)}>↺</button>
                  </div>
                  {d.max - d.min <= 100000 && d.key !== 'seed' && (
                    <Range min={d.min} max={d.key === 'num_ctx' ? m?.contextLength ?? d.max : d.max} step={d.step} value={val ?? Number(def ?? d.min)} onChange={(v) => setOpt(d.key, v)} />
                  )}
                </div>
              )
            })}
            {open[g] && g === 'Hardware' && (
              <Check checked={!!s.options.penalize_newline} onChange={(v) => setOpt('penalize_newline', v || undefined)}>Penalize newline</Check>
            )}
          </section>
        ))}

        <label className="field">Stop sequences <small className="muted">(one per line)</small>
          <Textarea rows={2} value={s.stop.join('\n')} onChange={(e) => updateSettings({ stop: e.target.value.split('\n').filter(Boolean) })} />
        </label>

        <label className="field">Keep model loaded
          <Input value={s.keepAlive} placeholder="5m (server default)" onChange={(e) => updateSettings({ keepAlive: e.target.value })} />
          <small className="muted">e.g. 30m, 1h, -1 (forever), 0 (unload after reply)</small>
        </label>

        <label className="field">Response format
          <Textarea className="font-mono" rows={3} value={s.format} placeholder={'empty = text · json · or a JSON schema'} onChange={(e) => updateSettings({ format: e.target.value })} />
        </label>

        <div className="row wrap">
          <Button variant="outline" size="sm" onClick={() => updateSettings({ options: {}, stop: [], think: 'default', format: '' })}>Reset to model defaults</Button>
          <Button variant="outline" size="sm" onClick={() => app.set({ defaults: JSON.parse(JSON.stringify(s)) })}>Use for new chats</Button>
        </div>
      </div>
    </aside>
  )
}
