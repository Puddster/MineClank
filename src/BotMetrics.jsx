import { Circle, CircleCheck, LoaderCircle, MapPin, Server } from 'lucide-react'

function StatusIcon({ status }) {
  if (status === 'online') return <CircleCheck size={15} />
  if (status === 'connecting' || status === 'reconnecting') return <LoaderCircle size={15} className="spin" />
  return <Circle size={13} />
}

export default function BotMetrics({ bot }) {
  const position = bot.position
    ? `${bot.position.x}, ${bot.position.y}, ${bot.position.z}${bot.dimension ? ` · ${bot.dimension}` : ''}`
    : '—'
  return (
    <div className="metrics-row">
      <div className="metric">
        <span className="metric-label">STATUS</span>
        <span className={`metric-value metric-status status-text-${bot.status}`}>
          <StatusIcon status={bot.status} />{bot.status}
        </span>
      </div>
      <div className="metric">
        <span className="metric-label">SERVER</span>
        <span className="metric-value"><Server size={14} />{bot.host}:{bot.port}</span>
      </div>
      <div className="metric">
        <span className="metric-label">POSITION / DIMENSION</span>
        <span className="metric-value"><MapPin size={14} />{position}</span>
      </div>
    </div>
  )
}