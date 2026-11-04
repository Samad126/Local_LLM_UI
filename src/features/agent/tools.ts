import { READ_ONLY_TOOLS, isToolName } from '@shared/agentTools'
import type { AgentMode } from '@/types'

export type ToolArgs = Record<string, any>
export const validCall = isToolName

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and folders in a directory of the workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative directory path, "." for the workspace root' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a text file. Output has line numbers (not part of the file). Use start_line/end_line for large files.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, start_line: { type: 'number' }, end_line: { type: 'number' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description:
        'Search file contents with a regex (case-insensitive). Returns path:line: text. Skips node_modules and .git.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string', description: 'Optional subfolder or file' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Create a file or overwrite it completely with the given content. Prefer edit_file for small changes to existing files.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Replace old_string with new_string in a file. old_string must match the file exactly (including whitespace) and be unique unless replace_all is true.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
          replace_all: { type: 'boolean' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Run a shell command in the workspace root (tests, build, git, etc.). 2 minute timeout. Returns combined output and exit code.',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    },
  },
]

export const toolsFor = (mode: AgentMode) =>
  mode === 'plan' ? TOOLS.filter((t) => READ_ONLY_TOOLS.has(t.function.name)) : TOOLS
