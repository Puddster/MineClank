import { Moon, Sun } from 'lucide-react'

export default function ThemeToggle({ activeTheme, onToggle }) {
  const isDark = activeTheme === 'dark'
  const Icon = isDark ? Moon : Sun
  return (
    <button className="theme-toggle" type="button" aria-label="Toggle dark mode" aria-pressed={isDark} onClick={onToggle}>
      <Icon size={14} />
      <span>{isDark ? 'Dark' : 'Light'}</span>
      <span className="theme-switch" aria-hidden="true"><span /></span>
    </button>
  )
}