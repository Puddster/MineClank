import { useLayoutEffect, useRef } from 'react'
import { Terminal } from 'lucide-react'
import ChatLogText from './ChatLogText.jsx'

export default function LiveStreamView({ bot, chatColorsEnabled, onCommand, onPlayer }) {
  const logStreamRef = useRef(null)
  useLayoutEffect(() => {
    if (logStreamRef.current) logStreamRef.current.scrollTop = logStreamRef.current.scrollHeight
  }, [bot?.id, bot?.logs?.length])
  return (
    <div ref={logStreamRef} className="log-stream detail-view" id="stream-panel" role="tabpanel" aria-labelledby="stream-tab" aria-live="polite" aria-label="Bot chat and server messages">
      {bot.logs?.length ? bot.logs.map((entry, index) => (
        <div className="log-line" key={`${entry.at}-${index}`}>
          <time>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</time>
          <span><ChatLogText entry={entry} chatColorsEnabled={chatColorsEnabled} onCommand={onCommand} onPlayer={onPlayer} /></span>
        </div>
      )) : (
        <div className="empty-log">
          <Terminal size={20} />
          <span>Waiting for server messages</span>
        </div>
      )}
    </div>
  )
}