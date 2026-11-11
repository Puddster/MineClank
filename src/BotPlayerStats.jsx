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

function Stat({ icon: Icon, label, value, detail = ' ' }) {
  return (
    <div className="player-stat">
      <span className="player-stat-label"><Icon size={13} /> {label}</span>
      <strong>{value}</strong>
      {detail !== ' ' && <small>{detail}</small>}
      {detail === ' ' && label === 'HUNGER' && <small> </small>}
      {detail === ' ' && label === 'EXPERIENCE' && <small> </small>}
    </div>
  )
}

export default function BotPlayerStats({ bot }) {
  const stats = bot.playerStats || {}
  return (
    <section className="player-stats" aria-label="Player status">
      <h3 className="player-stats-heading">PLAYER STATUS</h3>
      <div className="player-stats-grid">
        <Stat icon={Heart} label="HEALTH" value={Number.isFinite(stats.health) ? `${stats.health} HP` : '—'} />
        <Stat icon={Drumstick} label="HUNGER" value={Number.isFinite(stats.food) ? `${stats.food} / 20` : '—'} detail={Number.isFinite(stats.foodSaturation) ? `Saturation ${stats.foodSaturation}` : ' '} />
        <Stat icon={Wind} label="AIR" value={Number.isFinite(stats.oxygenLevel) ? `${stats.oxygenLevel} / 20` : '—'} />
        <Stat icon={Sparkles} label="EXPERIENCE" value={Number.isFinite(stats.experienceLevel) ? `Level ${stats.experienceLevel}` : '—'} detail={Number.isFinite(stats.experienceProgress) ? `${Math.round(stats.experienceProgress * 100)}% to next level` : ' '} />
        <Stat icon={Gamepad2} label="GAME MODE" value={stats.gameMode ? stats.gameMode[0].toUpperCase() + stats.gameMode.slice(1) : '—'} />
        <Stat icon={Activity} label="PLAYER" value={aliveStatus(stats)} />
        <Stat icon={Timer} label="SESSION TIME" value={bot.status === 'online' ? formatDuration(bot.uptimeSeconds) : '—'} />
      </div>
    </section>
  )
}