import { useState } from 'react'
import { useStore } from '../store'
import { uid } from '../lib/util'
import { Icon } from './Icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function Library() {
  const { prompts, presets, savePrompt, deletePrompt, deletePreset, updateSettings, setView, setDraft } = useStore()
  const [edit, setEdit] = useState<{ id: string; name: string; text: string } | null>(null)

  return (
    <div className="page">
      <h2>Library</h2>
      <section className="card">
        <div className="row between">
          <h3>Prompts</h3>
          <Button variant="default" size="sm" onClick={() => setEdit({ id: uid(), name: '', text: '' })}><Icon n="plus" /> New prompt</Button>
        </div>
        <p className="muted">Use as a system prompt, or type <code>/name</code> in the composer to insert one as a message.</p>
        {edit && (
          <div className="detail">
            <Input placeholder="Name (no spaces, used for /name)" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value.replace(/\s+/g, '-') })} />
            <Textarea rows={6} placeholder="Prompt text" value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
            <div className="row">
              <Button variant="default" size="sm" disabled={!edit.name || !edit.text} onClick={() => { savePrompt(edit); setEdit(null) }}>Save</Button>
              <Button variant="outline" size="sm" onClick={() => setEdit(null)}>Cancel</Button>
            </div>
          </div>
        )}
        {prompts.map((p) => (
          <div key={p.id} className="listrow">
            <div><b>/{p.name}</b><div className="muted clamp">{p.text}</div></div>
            <div className="actions">
              <Button variant="outline" size="sm" onClick={() => { updateSettings({ system: p.text }); setView('chat') }}>Use as system</Button>
              <Button variant="outline" size="sm" onClick={() => { setDraft(p.text); setView('chat') }}>Insert</Button>
              <Button variant="outline" size="sm" onClick={() => setEdit(p)}><Icon n="edit" size={14} /></Button>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => deletePrompt(p.id)}><Icon n="trash" size={14} /></Button>
            </div>
          </div>
        ))}
        {!prompts.length && <p className="muted">No prompts yet.</p>}
      </section>

      <section className="card">
        <h3>Parameter presets</h3>
        <p className="muted">Save presets from the chat Settings panel (includes sampling, system prompt, thinking, keep-alive and format).</p>
        {presets.map((p) => (
          <div key={p.id} className="listrow">
            <div><b>{p.name}</b><div className="muted clamp">{Object.entries(p.settings.options).map(([k, v]) => `${k}=${v}`).join(' · ') || 'model defaults'}</div></div>
            <div className="actions">
              <Button variant="outline" size="sm" onClick={() => { updateSettings(JSON.parse(JSON.stringify(p.settings))); setView('chat') }}>Apply to chat</Button>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => deletePreset(p.id)}><Icon n="trash" size={14} /></Button>
            </div>
          </div>
        ))}
        {!presets.length && <p className="muted">No presets yet.</p>}
      </section>
    </div>
  )
}
