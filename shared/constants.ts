/**
 * Values shared by the browser app, the Vite middleware (server/) and, by convention, electron/main.mjs.
 * Electron runs plain .mjs and cannot import this file; keep its APP_PORT default in sync.
 */

/** Port the app (Vite dev/preview server) listens on. Agent commands must never touch it. */
export const APP_PORT = 5173

/** Where the /ollama dev proxy forwards to. */
export const OLLAMA_URL = 'http://localhost:11434'

/** Where the /lmstudio dev proxy forwards to (LM Studio's local server). */
export const LMSTUDIO_URL = 'http://localhost:1234'

/** The agent's prompt (tool schemas + file contents) needs at least this much context. */
export const AGENT_MIN_CTX = 16384

/** Context assumed when neither the chat nor the model says otherwise. */
export const DEFAULT_CTX = 8192
