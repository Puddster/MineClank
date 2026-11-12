import { playerStats } from './player-stats.js'

export function PlayerStat({ icon: Icon, label, value, detail = ' ' }) {
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

export default function BotPlayerStats({ bot, pinBoard }) {
  return (
    <section className="player-stats" aria-label="Player status">
      <h3 className="player-stats-heading">PLAYER STATUS</h3>
      <div className="player-stats-grid">
        {playerStats(bot).map(stat => pinBoard?.editing ? (
          <button key={stat.id} type="button" className={`pin-target ${pinBoard.has('status', stat.id) ? 'is-pinned' : ''}`}
            aria-pressed={pinBoard.has('status', stat.id)} disabled={pinBoard.disabled}
            onClick={() => pinBoard.toggle('status', stat.id)}><PlayerStat {...stat} /></button>
        ) : <PlayerStat key={stat.id} {...stat} />)}
      </div>
    </section>
  )
}