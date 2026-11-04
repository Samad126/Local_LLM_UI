/** Tool names understood by both the client (schemas, policy) and the server (execution). */
export const TOOL_NAMES = ['list_dir', 'read_file', 'search', 'write_file', 'edit_file', 'run_command'] as const
export type ToolName = (typeof TOOL_NAMES)[number]

/** Tools that never change anything, so they run without approval in every mode. */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set<ToolName>(['list_dir', 'read_file', 'search'])

const NAMES: ReadonlySet<string> = new Set(TOOL_NAMES)
export const isToolName = (name: unknown): name is ToolName => typeof name === 'string' && NAMES.has(name)

export type AgentMode = 'ask' | 'edits' | 'plan' | 'auto'
