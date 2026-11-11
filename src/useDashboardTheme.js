import { useEffect, useLayoutEffect, useState } from 'react'

const THEME_STORAGE_KEY = 'mineclank-theme'

export function useDashboardTheme() {
  const [theme, setTheme] = useState(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'system'
  })
  const [systemTheme, setSystemTheme] = useState(() => (
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  ))
  const activeTheme = theme === 'system' ? systemTheme : theme

  useEffect(() => {
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = event => setSystemTheme(event.matches ? 'dark' : 'light')
    colorScheme.addEventListener('change', updateSystemTheme)
    return () => colorScheme.removeEventListener('change', updateSystemTheme)
  }, [])

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = activeTheme
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      activeTheme === 'dark' ? '#111a16' : '#f3f6f3'
    )
  }, [activeTheme])

  useEffect(() => {
    if (theme === 'system') {
      window.localStorage.removeItem(THEME_STORAGE_KEY)
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
  }, [theme])

  function toggleTheme() {
    setTheme(activeTheme === 'dark' ? 'light' : 'dark')
  }

  return { activeTheme, toggleTheme }
}