import { useLayoutEffect, useRef, useState } from 'react'
import { MessageCircle, Plus, Send } from 'lucide-react'

export default function DirectMessagesView({ bot, connection, isPending, sendAction, notice }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [newPlayer, setNewPlayer] = useState('')
  const [drafts, setDrafts] = useState({})
  const messagesRef = useRef(null)
  const threadsByPlayer = new Map()
  for (const entry of bot.directMessages || []) {
    const key = entry.player.toLowerCase()
    const thread = threadsByPlayer.get(key) || { player: entry.player, messages: [] }
    thread.player = entry.player
    thread.messages.push(entry)
    threadsByPlayer.delete(key)
    threadsByPlayer.set(key, thread)
  }
  const threads = [...threadsByPlayer.values()].reverse()
  const player = selectedPlayer || threads[0]?.player || ''
  const playerKey = player.toLowerCase()
  const messages = threadsByPlayer.get(playerKey)?.messages || []
  const draft = drafts[playerKey] || ''
  const maxLength = 256 - `/msg ${player} `.length
  const canSend = bot.status === 'online' && connection === 'online'

  useLayoutEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [playerKey, messages.length])

  function choosePlayer(event) {
    event.preventDefault()
    const username = newPlayer.trim()
    if (!/^[A-Za-z0-9_]{1,16}$/.test(username)) return
    setSelectedPlayer(threadsByPlayer.get(username.toLowerCase())?.player || username)
    setNewPlayer('')
  }

  function sendMessage(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!canSend || !player || !text || text.length > maxLength) return
    if (sendAction('bot:command', { command: `/msg ${player} ${text}` })) {
      setDrafts(current => ({ ...current, [playerKey]: '' }))
    }
  }

  return (
    <section className="direct-messages-view detail-view" id="direct-messages-panel" role="tabpanel" aria-labelledby="direct-messages-tab">
      <div className="dm-layout">
        <aside className="dm-sidebar" aria-label="Conversations">
          <div className="dm-sidebar-heading"><span className="panel-kicker">CONVERSATIONS</span><MessageCircle size={15} aria-hidden="true" /></div>
          <form className="dm-new" onSubmit={choosePlayer}>
            <input aria-label="Minecraft username" placeholder="Minecraft username" value={newPlayer} onChange={event => setNewPlayer(event.target.value)} maxLength={16} autoComplete="off" />
            <button type="submit" aria-label="Start conversation" title="Start conversation" disabled={!/^[A-Za-z0-9_]{1,16}$/.test(newPlayer.trim())}><Plus size={16} /></button>
          </form>
          <div className="dm-threads">
            {threads.map(thread => {
              const last = thread.messages[thread.messages.length - 1]
              return <button key={thread.player.toLowerCase()} type="button" className={`dm-thread ${thread.player.toLowerCase() === playerKey ? 'selected' : ''}`} aria-pressed={thread.player.toLowerCase() === playerKey} onClick={() => setSelectedPlayer(thread.player)}>
                <strong>{thread.player}</strong><span>{last.direction === 'outgoing' ? 'You: ' : ''}{last.text}</span>
              </button>
            })}
            {!threads.length && <div className="dm-empty-list">No conversations yet</div>}
          </div>
        </aside>
        <div className="dm-conversation">
          {player ? <>
            <div className="dm-conversation-heading"><MessageCircle size={15} aria-hidden="true" /><strong>{player}</strong><span>{connection !== 'online' ? 'CONTROL OFFLINE' : bot.status === 'online' ? 'DIRECT MESSAGE' : 'BOT OFFLINE'}</span></div>
            <div className="dm-messages" ref={messagesRef} aria-label={`Conversation with ${player}`} aria-live="polite">
              {messages.length ? messages.map((entry, index) => <div key={`${entry.at}-${index}`} className={`dm-message ${entry.direction}`}>
                <div className="dm-message-meta"><strong>{entry.direction === 'outgoing' ? 'You' : entry.player}</strong><time>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</time></div>
                <div className="dm-message-text">{entry.text}</div>
              </div>) : <div className="dm-empty">No messages with {player}</div>}
            </div>
            <form className="command-form dm-compose" onSubmit={sendMessage}>
              <input aria-label={`Message ${player}`} placeholder={`Message ${player}`} value={draft} onChange={event => setDrafts(current => ({ ...current, [playerKey]: event.target.value }))} maxLength={maxLength} disabled={!canSend} autoComplete="off" />
              <button type="submit" aria-label="Send direct message" title="Send direct message" disabled={!canSend || !draft.trim() || isPending('bot:command')}><Send size={16} /></button>
            </form>
          </> : <div className="dm-empty"><MessageCircle size={20} aria-hidden="true" /><span>No conversation selected</span></div>}
          {notice && <div className="notice" role="status">{notice}</div>}
        </div>
      </div>
    </section>
  )
}