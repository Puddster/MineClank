import { Wifi, WifiOff } from 'lucide-react'

const labels = {
  online: 'Connected',
  reconnecting: 'Reconnecting',
  connecting: 'Connecting',
  offline: 'Offline'
}

export default function ConnectionStatus({ connection }) {
  const Icon = connection === 'online' ? Wifi : WifiOff
  return (
    <span className={`connection-pill connection-${connection}`}>
      <Icon size={14} />{labels[connection] || labels.offline}
    </span>
  )
}