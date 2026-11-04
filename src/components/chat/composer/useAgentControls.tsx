import { useState } from 'react'
import { MODES, MODE_INFO } from '@/features/agent/policy'
import { checkWorkspace } from '@/services/agentApi'
import { Confirm } from '@/components/common/Confirm'
import { PromptDialog } from '@/components/common/PromptDialog'
import { Icon } from '@/components/common/Icon'
import { Button } from '@/components/ui/button'
import type { AgentMode, Chat } from '@/types'

const AUTO_OK_KEY = 'agent-auto-ok'

const readAutoOk = () => {
  try {
    return localStorage.getItem(AUTO_OK_KEY) === '1'
  } catch {
    return false // storage blocked: ask every time
  }
}
const rememberAutoOk = () => {
  try {
    localStorage.setItem(AUTO_OK_KEY, '1')
  } catch {
    /* ignore */
  }
}

interface Opts {
  agent: Chat['agent']
  setAgent: (patch: Partial<NonNullable<Chat['agent']>>) => void
  onError: (msg: string) => void
}

/** Agent on/off, project-folder choice and mode switching (with the one-time Auto-mode confirmation). */
export function useAgentControls({ agent, setAgent, onError }: Opts) {
  const [folderDialog, setFolderDialog] = useState(false)
  const [autoDialog, setAutoDialog] = useState(false)
  const agentOn = !!agent?.on && !!agent.workspace
  const mode: AgentMode = agent?.mode ?? 'ask'

  const applyFolder = async (dir: string) => {
    const r = await checkWorkspace(dir).catch(
      () => ({ ok: false, error: 'Server unreachable' }) as Awaited<ReturnType<typeof checkWorkspace>>,
    )
    if (!r.ok) return onError(`Folder not usable: ${r.error ?? dir}`)
    setAgent({ on: true, workspace: r.path ?? dir })
  }

  const pickFolder = async () => {
    onError('')
    if (!window.desktop) return setFolderDialog(true) // browser: type the path
    const dir = await window.desktop.pickFolder()
    if (dir) await applyFolder(dir)
  }

  const setMode = (m: AgentMode) => {
    if (m === 'auto' && !readAutoOk()) return setAutoDialog(true)
    setAgent({ mode: m })
  }
  const cycleMode = () => setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length])
  const toggleAgent = async () => {
    if (agentOn) return setAgent({ on: false })
    if (agent?.workspace) return setAgent({ on: true })
    await pickFolder()
  }

  const dialogs = (
    <>
      <PromptDialog
        open={folderDialog}
        onOpenChange={setFolderDialog}
        title="Project folder"
        label="Absolute path of the project folder"
        initial={agent?.workspace ?? ''}
        placeholder="/home/me/project"
        action="Use folder"
        onSubmit={applyFolder}
      />
      <Confirm
        open={autoDialog}
        onOpenChange={setAutoDialog}
        title="Enable Auto mode?"
        description={
          'Auto mode lets the model edit files and run shell commands in this folder without asking.\n\nRisky commands (sudo, rm -rf, force-push…) still ask.'
        }
        action="Enable Auto mode"
        onConfirm={() => {
          rememberAutoOk()
          setAgent({ mode: 'auto' })
        }}
      />
    </>
  )

  return { agentOn, mode, cycleMode, toggleAgent, pickFolder, dialogs }
}

type Controls = ReturnType<typeof useAgentControls>

/** Toolbar buttons for the coding agent: toggle, folder, mode. */
export function AgentButtons({ agent, c }: { agent: Chat['agent']; c: Controls }) {
  const folderName = agent?.workspace.split('/').filter(Boolean).pop()
  return (
    <>
      <Button
        variant={c.agentOn ? 'secondary' : 'ghost'}
        size="sm"
        className={c.agentOn ? 'text-primary' : ''}
        title={c.agentOn ? `Agent ON · ${agent?.workspace}` : 'Coding agent: pick a project folder'}
        onClick={c.toggleAgent}
      >
        <Icon n="terminal" />
      </Button>
      {c.agentOn && (
        <>
          <Button variant="ghost" size="sm" title={agent?.workspace + ' (click to change)'} onClick={c.pickFolder}>
            <Icon n="folder" /> <small>{folderName}</small>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className={
              'h-7 rounded-full text-xs ' +
              (c.mode === 'auto' ? 'text-destructive' : c.mode === 'plan' ? 'text-primary' : '')
            }
            title={`${MODE_INFO[c.mode].hint} (Shift+Tab to switch)`}
            onClick={c.cycleMode}
          >
            {MODE_INFO[c.mode].label}
          </Button>
        </>
      )}
    </>
  )
}
