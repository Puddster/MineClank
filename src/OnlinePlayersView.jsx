import { Users } from 'lucide-react'
import { formatOnlinePlayerDisplayName } from './online-player-display-name.js'

function OnlinePlayerTile({ player, onMessage }) {
  const displayName = formatOnlinePlayerDisplayName(player.displayName)
  const distanceTitle = player.isSelf
    ? 'This bot'
    : Number.isFinite(player.distance)
      ? '3D distance in blocks from bot'
      : 'Distance unavailable; player entity is not currently tracked'

  return (
    <li>
      <button type="button" className="online-player-tile" aria-label={`Message ${displayName}`} title={`Message ${displayName}`} onClick={() => onMessage(player.username)}>
        <span className="online-player-avatar" aria-hidden="true">
          <Users size={14} />
          {player.skinUrl && (
            <>
              <img className="online-player-skin online-player-skin-face" src={player.skinUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
              <img className="online-player-skin online-player-skin-hat" src={player.skinUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
            </>
          )}
        </span>
        <span className="online-player-name">{displayName}</span>
        <span className={`online-player-distance ${player.isSelf ? 'is-self' : ''}`} title={distanceTitle}>
          {player.isSelf ? 'YOU' : Number.isFinite(player.distance) ? `${player.distance} blocks` : '—'}
        </span>
      </button>
    </li>
  )
}

export default function OnlinePlayersView({ bot, onlinePlayers, nearbyPlayers, allPlayers, onMessage }) {
  return (
    <section className="online-players-view detail-view" id="online-players-panel" role="tabpanel" aria-labelledby="online-players-tab">
      <div className="online-players-heading">
        <div><span className="panel-kicker">SERVER PLAYER LIST</span><h3>Online Players</h3></div>
        <span className="inventory-total">{onlinePlayers.length} online</span>
      </div>
      {bot.status !== 'online' ? (
        <div className="online-players-empty">Player list is available while the bot is online.</div>
      ) : onlinePlayers.length ? (
        <>
          <section className="online-player-section" aria-labelledby="nearby-players-heading">
            <div className="inventory-section-heading"><h4 id="nearby-players-heading">Nearby</h4><span>{nearbyPlayers.length} tracked</span></div>
            {nearbyPlayers.length ? (
              <ul className="online-player-grid" aria-label="Nearby players, nearest first">
                {nearbyPlayers.map(player => <OnlinePlayerTile key={player.username} player={player} onMessage={onMessage} />)}
              </ul>
            ) : (
              <div className="online-players-empty online-players-empty-compact">No nearby players are currently tracked.</div>
            )}
          </section>
          <section className="online-player-section" aria-labelledby="everyone-players-heading">
            <div className="inventory-section-heading"><h4 id="everyone-players-heading">Everyone</h4><span>{allPlayers.length} players · alphabetical</span></div>
            <ul className="online-player-grid" aria-label="Everyone online, alphabetical">
              {allPlayers.map(player => <OnlinePlayerTile key={player.username} player={player} onMessage={onMessage} />)}
            </ul>
          </section>
        </>
      ) : (
        <div className="online-players-empty">No online players are reported by the server.</div>
      )}
    </section>
  )
}