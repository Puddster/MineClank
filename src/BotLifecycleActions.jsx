import { LoaderCircle, Play, Square } from 'lucide-react'

export default function BotLifecycleActions({ bot, isPending, sendAction }) {
  return (
    <div className="lifecycle-actions">
      {bot.status === 'online' ? (
        <button className="icon-button stop-button" type="button" title="Stop bot" aria-label="Stop bot" disabled={isPending('bot:stop')} onClick={() => sendAction('bot:stop')}>
          <Square size={15} fill="currentColor" />
        </button>
      ) : ['connecting', 'reconnecting'].includes(bot.status) ? (
        <button className="inventory-action-button inventory-drop-stack-button stop-reconnecting-button" type="button" disabled={isPending('bot:stop')} onClick={() => sendAction('bot:stop')}>
          <Square size={14} fill="currentColor" /> Stop reconnecting
        </button>
      ) : bot.status === 'stopping' ? (
        <button className="start-button" type="button" disabled>
          <LoaderCircle size={15} className="spin" /> Stopping…
        </button>
      ) : (
        <button className="start-button" type="button" disabled={isPending('bot:start') || ['connecting', 'reconnecting', 'stopping'].includes(bot.status)} onClick={() => sendAction('bot:start')}>
          {isPending('bot:start') ? <LoaderCircle size={15} className="spin" /> : <Play size={15} fill="currentColor" />}
          Start bot
        </button>
      )}
    </div>
  )
}