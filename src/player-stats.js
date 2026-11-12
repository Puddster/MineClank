import { Activity, Drumstick, Gamepad2, Heart, Sparkles, Timer, Wind } from 'lucide-react'

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const remainingMinutes = minutes % 60
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${remainingMinutes}m`
  return `${remainingMinutes}m`
}

function aliveStatus(stats) {
  if (stats.isAlive === null || stats.isAlive === undefined) return '—'
  if (!stats.isAlive) return 'Dead'
  return stats.isSleeping ? 'Sleeping' : 'Alive'
}

export function playerStats(bot) {
  const stats = bot.playerStats || {}
  return [
    { id: 'health', icon: Heart, label: 'HEALTH', value: Number.isFinite(stats.health) ? `${stats.health} HP` : '—' },
    { id: 'hunger', icon: Drumstick, label: 'HUNGER', value: Number.isFinite(stats.food) ? `${stats.food} / 20` : '—', detail: Number.isFinite(stats.foodSaturation) ? `Saturation ${stats.foodSaturation}` : ' ' },
    { id: 'air', icon: Wind, label: 'AIR', value: Number.isFinite(stats.oxygenLevel) ? `${stats.oxygenLevel} / 20` : '—' },
    { id: 'experience', icon: Sparkles, label: 'EXPERIENCE', value: Number.isFinite(stats.experienceLevel) ? `Level ${stats.experienceLevel}` : '—', detail: Number.isFinite(stats.experienceProgress) ? `${Math.round(stats.experienceProgress * 100)}% to next level` : ' ' },
    { id: 'game-mode', icon: Gamepad2, label: 'GAME MODE', value: stats.gameMode ? stats.gameMode[0].toUpperCase() + stats.gameMode.slice(1) : '—' },
    { id: 'player', icon: Activity, label: 'PLAYER', value: aliveStatus(stats) },
    { id: 'session-time', icon: Timer, label: 'SESSION TIME', value: bot.status === 'online' ? formatDuration(bot.uptimeSeconds) : '—' }
  ]
}