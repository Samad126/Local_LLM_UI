import { useEffect } from 'react'
import { useApp } from '@/stores/settingsStore'

/** Apply the chosen theme (following the OS when set to "system") and font size to the document. */
export function useTheme() {
  const theme = useApp((s) => s.theme)
  const fontSize = useApp((s) => s.fontSize)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    document.documentElement.style.fontSize = fontSize + 'px'
  }, [fontSize])
}
