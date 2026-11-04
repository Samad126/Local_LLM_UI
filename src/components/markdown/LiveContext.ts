import { createContext } from 'react'

/** True while the surrounding message is still streaming (file cards wait for the full text). */
export const LiveCtx = createContext(false)
