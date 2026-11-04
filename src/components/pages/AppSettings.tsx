import { useRef, useState } from 'react'
import { parseChatImport } from '@/lib/importChats'
import { useApp } from '@/stores/settingsStore'
import { useStore } from '@/stores/chatStore'
import { db } from '@/services/db'
import { download } from '@/lib/download'
import { Button } from '@/components/ui/button'
import { Pick, Check, Range } from '@/components/common/Fields'
import { Confirm } from '@/components/common/Confirm'
import { Input } from '@/components/ui/input'

export function AppSettings() {
  const app = useApp()
  const { chats, models, online, version, refreshModels, importChats, wipe } = useStore()
  const file = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState('')

  return (
    <div className="page">
      <h2>App settings</h2>
      <section className="card">
        <h3>Connection</h3>
        <label className="field">
          Ollama host
          <div className="row">
            <Input value={app.host} onChange={(e) => app.set({ host: e.target.value })} />
            <Button variant="outline" size="sm" onClick={refreshModels}>
              Test
            </Button>
          </div>
          <small className="muted">
            <code>/ollama</code> uses the built-in dev proxy to localhost:11434 (no CORS setup). For a direct URL such
            as http://localhost:11434, start Ollama with <code>OLLAMA_ORIGINS=*</code>.
          </small>
        </label>
        <p>{online ? `✅ Connected — Ollama ${version}` : online === false ? '❌ Not reachable' : '…'}</p>
      </section>

      <section className="card">
        <h3>Appearance & behavior</h3>
        <div className="grid2">
          <label className="field">
            Theme
            <Pick
              value={app.theme}
              onChange={(v) => app.set({ theme: v as any })}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'System' },
              ]}
            />
          </label>
          <label className="field">
            Font size ({app.fontSize}px)
            <Range min={12} max={20} value={app.fontSize} onChange={(v) => app.set({ fontSize: v })} />
          </label>
          <label className="field">
            Default model for new chats
            <Pick
              value={app.defaults.model}
              onChange={(v) => app.set({ defaults: { ...app.defaults, model: v } })}
              options={models.map((m) => ({ value: m.name, label: m.name }))}
            />
          </label>
          <label className="field">
            Default context window (tokens)
            <Input
              type="number"
              step={1024}
              min={512}
              value={app.defaults.options.num_ctx ?? ''}
              placeholder="model default"
              onChange={(e) =>
                app.set({
                  defaults: {
                    ...app.defaults,
                    options: {
                      ...app.defaults.options,
                      num_ctx: e.target.value === '' ? undefined : Number(e.target.value),
                    },
                  },
                })
              }
            />
            <small className="text-muted-foreground">Applies to new chats.</small>
          </label>
          <label className="field">
            Thinking (default for new chats)
            <Pick
              value={app.defaults.think}
              onChange={(v) => app.set({ defaults: { ...app.defaults, think: v as any } })}
              options={[
                { value: 'default', label: 'Model default' },
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off (faster)' },
              ]}
            />
            <small className="text-muted-foreground">
              Only for models that support thinking. Each chat can override it in its Settings panel.
            </small>
          </label>
          <label className="field">
            Send with
            <Pick
              value={app.sendOnEnter ? 'enter' : 'mod'}
              onChange={(v) => app.set({ sendOnEnter: v === 'enter' })}
              options={[
                { value: 'enter', label: 'Enter (Shift+Enter = newline)' },
                { value: 'mod', label: 'Ctrl/Cmd+Enter' },
              ]}
            />
          </label>
        </div>
        <Check checked={app.showStats} onChange={(v) => app.set({ showStats: v })}>
          Show tokens/sec and stats under replies
        </Check>
        <p className="muted">
          Defaults for new chats (sampling, context, keep-alive) come from the chat Settings panel → "Use for new
          chats". Shortcuts: Ctrl+K new chat · Ctrl+, settings · Esc close panel.
        </p>
      </section>

      <section className="card">
        <h3>Web search</h3>
        <p className="muted">
          Toggle the globe button next to the message box. Results (and optionally page text) are added to the prompt,
          so it works with every model. Search runs from the local server, not the browser.
        </p>
        <div className="grid2">
          <label className="field">
            Engine
            <Pick
              value={app.searchEngine}
              onChange={(v) => app.set({ searchEngine: v as any })}
              options={[
                { value: 'ddg', label: 'DuckDuckGo (no key)' },
                { value: 'searxng', label: 'SearXNG (self-hosted)' },
              ]}
            />
          </label>
          {app.searchEngine === 'searxng' && (
            <label className="field">
              SearXNG URL
              <Input value={app.searxUrl} onChange={(e) => app.set({ searxUrl: e.target.value })} />
            </label>
          )}
          <label className="field">
            Results ({app.searchResults})
            <Range min={1} max={10} value={app.searchResults} onChange={(v) => app.set({ searchResults: v })} />
          </label>
          <label className="field">
            Max characters per page ({app.searchPageChars})
            <Range
              min={500}
              max={12000}
              step={500}
              value={app.searchPageChars}
              onChange={(v) => app.set({ searchPageChars: v })}
            />
          </label>
        </div>
        <Check checked={app.searchFetchPages} onChange={(v) => app.set({ searchFetchPages: v })}>
          Read the full pages (better answers, slower) instead of snippets only
        </Check>
        <Check checked={app.searchRewrite} onChange={(v) => app.set({ searchRewrite: v })}>
          Let the model rewrite follow-up questions into a standalone search query
        </Check>
        <p className="muted">Larger pages need a larger context window (Settings → Context window).</p>
      </section>

      <section className="card">
        <h3>Data ({chats.length} chats, stored in this browser)</h3>
        <div className="row wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={async () =>
              download(
                'local-llm-backup.json',
                JSON.stringify({
                  chats: await db.chats.toArray(),
                  presets: await db.presets.toArray(),
                  prompts: await db.prompts.toArray(),
                }),
              )
            }
          >
            Export everything
          </Button>
          <Button variant="outline" size="sm" onClick={() => file.current?.click()}>
            Import chats
          </Button>
          <Confirm
            title="Delete ALL chats, presets and prompts?"
            description="This cannot be undone."
            action="Wipe everything"
            onConfirm={wipe}
          >
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
              Wipe all data
            </Button>
          </Confirm>
        </div>
        {importError && <p className="warnText">{importError}</p>}
        <input
          ref={file}
          type="file"
          accept=".json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              importChats(parseChatImport(await f.text()))
              setImportError('')
            } catch (err) {
              setImportError(`Could not import: ${err instanceof Error ? err.message : 'invalid file'}`)
            }
            e.target.value = ''
          }}
        />
      </section>
    </div>
  )
}
