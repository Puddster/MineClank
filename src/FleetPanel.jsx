import { useState } from 'react'
import { ArrowUpRight, Bot, ChevronLeft, ChevronRight, Plus } from 'lucide-react'

function FleetBotAvatar({ bot }) {
  const [failedSkinUrl, setFailedSkinUrl] = useState(null)
  const skinUrl = bot.skinUrl || bot.onlinePlayers?.find(player =>
    player.isSelf || player.username === bot.username
  )?.skinUrl
  return (
    <span className={`bot-avatar status-${bot.status}`} aria-hidden="true">
      <Bot size={15} />
      {skinUrl && failedSkinUrl !== skinUrl && (
        <>
          <img
            className="fleet-bot-skin fleet-bot-skin-face"
            src={skinUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailedSkinUrl(skinUrl)}
          />
          <img
            className="fleet-bot-skin fleet-bot-skin-hat"
            src={skinUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailedSkinUrl(skinUrl)}
          />
        </>
      )}
    </span>
  )
}

export default function FleetPanel({ bots, selectedBotId, onAdd, onSelect, collapsed, onToggleCollapsed }) {
  const autoStartCount = bots.filter(bot => bot.autoStart !== false).length
  return (
    <aside className={`fleet-panel panel ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="panel-heading">
        <div className="fleet-panel-title">
          <span className="panel-kicker">ACCOUNTS</span>
          <h2>Fleet <span className="count-badge">{bots.length}</span></h2>
        </div>
        <div className="fleet-panel-actions">
          <button
            type="button"
            className="inventory-action-button fleet-collapse-button"
            aria-label={collapsed ? 'Expand fleet panel' : 'Collapse fleet panel'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand fleet panel' : 'Collapse fleet panel'}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
          <button type="button" className="inventory-action-button fleet-add-button" aria-label="Add bot" title="Add bot" onClick={onAdd}>
          <Plus size={14} /> Add bot
          </button>
        </div>
      </div>
      <div className="bot-list">
        {bots.map(bot => (
          <button
            type="button"
            className={`bot-row ${selectedBotId === bot.id ? 'selected' : ''}`}
            key={bot.id}
            onClick={() => onSelect(bot)}
            aria-label={`Select ${bot.username}, ${bot.status}`}
            aria-current={selectedBotId === bot.id ? 'true' : undefined}
            title={`${bot.username} · ${bot.status}`}
          >
            <FleetBotAvatar key={bot.id} bot={bot} />
            <span className="bot-summary">
              <span className="bot-name">{bot.username}</span>
              <span className="bot-subline"><span className={`status-dot status-${bot.status}`} />{bot.status}</span>
            </span>
            <ArrowUpRight size={15} className="row-arrow" />
          </button>
        ))}
        {!bots.length && (
          <div className="empty-fleet"><Bot size={24} /><p>No bot profiles loaded</p></div>
        )}
      </div>
      <div className="fleet-footer">
        <span className="status-dot status-online" />
        AUTOSTART QUEUE
        <span className="footer-value">{autoStartCount}/{bots.length}</span>
      </div>
    </aside>
  )
}