import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import 'katex/dist/katex.min.css'
import '@/index.css'
import { App } from '@/App'

createRoot(document.getElementById('root')!).render(<App />)
