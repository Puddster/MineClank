import { ArrowUpRight, Bot, Plus } from 'lucide-react'

export default function FleetPanel({ bots, selectedBotId, onAdd, onSelect }) {
  const autoStartCount = bots.filter(bot => bot.autoStart !== false).length
  return (
    <aside className="fleet-panel panel">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">ACCOUNTS</span>
          <h2>Fleet <span className="count-badge">{bots.length}</span></h2>
        </div>
        <button type="button" className="inventory-action-button fleet-add-button" onClick={onAdd}>
          <Plus size={14} /> Add bot
        </button>
      </div>
      <div className="bot-list">
        {bots.map(bot => (
          <button type="button" className={`bot-row ${selectedBotId === bot.id ? 'selected' : ''}`} key={bot.id} onClick={() => onSelect(bot)}>
            <span className={`bot-avatar status-${bot.status}`}><Bot size={18} /></span>
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