import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Bot,
  Circle,
  CircleCheck,
  LoaderCircle,
  MapPin,
  Moon,
  Palette,
  Play,
  Radio,
  Send,
  Server,
  Square,
  Sun,
  Terminal,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { getWebSocketUrl } from './client.js'
import './Dashboard.css'

const THEME_STORAGE_KEY = 'mineclank-theme'

function Dashboard() {
  const [theme, setTheme] = useState(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'system'
  })
  const [systemTheme, setSystemTheme] = useState(() => (
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  ))
  const [bots, setBots] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [connection, setConnection] = useState('connecting')
  const [command, setCommand] = useState('')
  const [pending, setPending] = useState({})
  const [notice, setNotice] = useState('')
  const [chatColorsEnabled, setChatColorsEnabled] = useState(true)
  const [suggestions, setSuggestions] = useState([])
  const socketRef = useRef(null)
  const pendingRef = useRef({})
  const completionRequestRef = useRef(null)
  const completionTimerRef = useRef(null)
  const commandInputRef = useRef(null)
  const logEndRef = useRef(null)

  useEffect(() => {
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = event => setSystemTheme(event.matches ? 'dark' : 'light')
    colorScheme.addEventListener('change', updateSystemTheme)
    return () => colorScheme.removeEventListener('change', updateSystemTheme)
  }, [])

  const activeTheme = theme === 'system' ? systemTheme : theme

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = activeTheme
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      activeTheme === 'dark' ? '#111a16' : '#f3f6f3'
    )
  }, [activeTheme])

  useEffect(() => {
    if (theme === 'system') {
      window.localStorage.removeItem(THEME_STORAGE_KEY)
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
  }, [theme])

  function toggleTheme() {
    setTheme(activeTheme === 'dark' ? 'light' : 'dark')
  }

  useEffect(() => {
    let active = true
    let reconnectTimer
    let initialConnectTimer
    let attempts = 0

    const connect = () => {
      if (!active) return
      setConnection(attempts ? 'reconnecting' : 'connecting')
      const socket = new WebSocket(getWebSocketUrl())
      socketRef.current = socket

      socket.addEventListener('open', () => {
        attempts = 0
        setConnection('online')
      })

      socket.addEventListener('message', event => {
        const message = JSON.parse(event.data)
        if (message.type === 'snapshot') {
          setBots(message.bots)
          setSelectedId(current => current || message.bots[0]?.id || null)
        } else if (message.type === 'bot:state') {
          setBots(current => current.map(bot => bot.id === message.bot.id ? message.bot : bot))
          if (message.bot.status !== 'online') {
            completionRequestRef.current = null
            setSuggestions([])
          }
        } else if (message.type === 'bot:log') {
          setBots(current => current.map(bot => bot.id === message.id
            ? { ...bot, logs: [...(bot.logs || []), message.entry].slice(-200) }
            : bot))
        } else if (message.type === 'bot:completion') {
          if (message.requestId === completionRequestRef.current) {
            setSuggestions(message.suggestions || [])
          }
        } else if (message.type === 'action:result') {
          const action = pendingRef.current[message.requestId]
          delete pendingRef.current[message.requestId]
          setPending(current => {
            const next = { ...current }
            delete next[message.requestId]
            return next
          })
          const errorMessage = message.error === 'Unsupported action' && action === 'bot:complete'
            ? 'Restart the backend to enable command completion'
            : message.error
          setNotice(message.ok ? (action === 'bot:command' ? 'Message sent' : 'Bot action complete') : errorMessage)
          window.setTimeout(() => setNotice(''), 3500)
        }
      })

      socket.addEventListener('close', () => {
        if (!active) return
        setConnection('offline')
        pendingRef.current = {}
        completionRequestRef.current = null
        setSuggestions([])
        setPending({})
        attempts += 1
        reconnectTimer = window.setTimeout(connect, Math.min(15000, 800 * 2 ** Math.min(attempts, 5)))
      })

      socket.addEventListener('error', () => socket.close())
    }

    initialConnectTimer = window.setTimeout(connect, 0)
    return () => {
      active = false
      window.clearTimeout(initialConnectTimer)
      window.clearTimeout(reconnectTimer)
      window.clearTimeout(completionTimerRef.current)
      socketRef.current?.close()
    }
  }, [])

  const selectedBot = bots.find(bot => bot.id === selectedId) || bots[0] || null
  const selectedBotId = selectedBot?.id
  const selectedBotStatus = selectedBot?.status
  const onlineCount = bots.filter(bot => bot.status === 'online').length
  const isPending = action => Object.values(pending).includes(action)

  const requestCompletions = useCallback(value => {
    const socket = socketRef.current
    if (!selectedBotId || selectedBotStatus !== 'online' || socket?.readyState !== WebSocket.OPEN) return
    const requestId = crypto.randomUUID()
    completionRequestRef.current = requestId
    socket.send(JSON.stringify({
      type: 'bot:complete',
      id: selectedBotId,
      command: value.trimStart(),
      requestId
    }))
  }, [selectedBotId, selectedBotStatus])

  useEffect(() => {
    window.clearTimeout(completionTimerRef.current)
    completionRequestRef.current = null

    const value = command.trimStart()
    if (!value.startsWith('/') || selectedBot?.status !== 'online' || connection !== 'online') return

    completionTimerRef.current = window.setTimeout(() => requestCompletions(value), 250)
    return () => window.clearTimeout(completionTimerRef.current)
  }, [command, connection, requestCompletions, selectedBot?.status])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [selectedBot?.logs?.length])

  function sendAction(type, values = {}) {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setNotice('Control service is offline')
      return false
    }
    const requestId = crypto.randomUUID()
    pendingRef.current[requestId] = type
    setPending({ ...pendingRef.current })
    socketRef.current.send(JSON.stringify({ type, id: selectedBot?.id, requestId, ...values }))
    return true
  }

  function submitMessage(event) {
    event.preventDefault()
    const value = command.trim()
    if (!selectedBot || !value) return
    if (sendAction('bot:command', { command: value })) {
      setSuggestions([])
      setCommand('')
    }
  }

  function applySuggestion(suggestion) {
    const value = command.trimStart()
    const wordStart = value.lastIndexOf(' ') + 1
    const prefix = value.slice(0, wordStart)
    const candidate = suggestion.startsWith('/') || suggestion.startsWith(value.trim())
      ? suggestion
      : `${wordStart === 0 && value.startsWith('/') ? '/' : prefix}${suggestion}`
    setCommand(candidate)
    setSuggestions([])
    commandInputRef.current?.focus()
  }

  function handleCommandKeyDown(event) {
    if (event.key === 'Escape') {
      setSuggestions([])
    } else if (event.key === 'Tab' && command.trimStart().startsWith('/')) {
      event.preventDefault()
      if (suggestions.length) {
        applySuggestion(suggestions[0])
      } else {
        window.clearTimeout(completionTimerRef.current)
        requestCompletions(command)
      }
    } else if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault()
      document.getElementById('command-suggestion-0')?.focus()
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#fleet" aria-label="MineClank home">
          <span className="brand-mark"><Bot size={19} strokeWidth={2.2} /></span>
          <span>MINECLANK<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-meta">
          <span className="environment"><span className="environment-dot" /> CONTROL PLANE</span>
          <span className={`connection-pill connection-${connection}`}>
            {connection === 'online' ? <Wifi size={14} /> : <WifiOff size={14} />}
            {connection === 'online' ? 'Connected' : connection === 'reconnecting' ? 'Reconnecting' : connection === 'connecting' ? 'Connecting' : 'Offline'}
          </span>
        </div>
      </header>

      <section className="page-heading" id="fleet">
        <div>
          <div className="eyebrow"><Activity size={14} /> FLEET OPERATIONS</div>
          <h1>Bot control</h1>
        </div>
        <div className="fleet-totals" aria-label={`${onlineCount} of ${bots.length} bots online`}>
          <span className="total-online">{String(onlineCount).padStart(2, '0')}</span>
          <span className="total-divider">/</span>
          <span className="total-all">{String(bots.length).padStart(2, '0')}</span>
          <span className="total-caption">ONLINE</span>
        </div>
      </section>

      <section className="control-grid">
        <aside className="fleet-panel panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">ACCOUNTS</span>
              <h2>Fleet <span className="count-badge">{bots.length}</span></h2>
            </div>
            <Server size={17} className="muted-icon" />
          </div>

          <div className="bot-list">
            {bots.map(bot => (
              <button
                type="button"
                className={`bot-row ${selectedBot?.id === bot.id ? 'selected' : ''}`}
                key={bot.id}
                onClick={() => setSelectedId(bot.id)}
              >
                <span className={`bot-avatar status-${bot.status}`}><Bot size={18} /></span>
                <span className="bot-summary">
                  <span className="bot-name">{bot.username}</span>
                  <span className="bot-subline"><span className={`status-dot status-${bot.status}`} />{bot.status}</span>
                </span>
                <ArrowUpRight size={15} className="row-arrow" />
              </button>
            ))}
            {!bots.length && (
              <div className="empty-fleet">
                <Bot size={24} />
                <p>No bot profiles loaded</p>
              </div>
            )}
          </div>

          <div className="fleet-footer">
            <span className="status-dot status-online" />
            AUTOSTART QUEUE
            <span className="footer-value">{bots.length ? 'ACTIVE' : 'IDLE'}</span>
          </div>
        </aside>

        <section className={`detail-panel panel ${selectedBot ? '' : 'detail-empty'}`} aria-label="Selected bot details">
          {selectedBot ? (
            <>
              <div className="selected-heading">
                <div className="selected-identity">
                  <span className={`selected-avatar status-${selectedBot.status}`}><Bot size={22} /></span>
                  <div>
                    <span className="panel-kicker">BOT PROFILE / {selectedBot.id}</span>
                    <h2>{selectedBot.username}</h2>
                  </div>
                </div>
                <div className="lifecycle-actions">
                  {selectedBot.status === 'online' ? (
                    <button className="icon-button stop-button" type="button" title="Stop bot" aria-label="Stop bot" disabled={isPending('bot:stop')} onClick={() => sendAction('bot:stop')}>
                      <Square size={15} fill="currentColor" />
                    </button>
                  ) : (
                    <button className="start-button" type="button" disabled={isPending('bot:start') || ['connecting', 'reconnecting', 'stopping'].includes(selectedBot.status)} onClick={() => sendAction('bot:start')}>
                      {isPending('bot:start') ? <LoaderCircle size={15} className="spin" /> : <Play size={15} fill="currentColor" />}
                      Start bot
                    </button>
                  )}
                </div>
              </div>

              <div className="metrics-row">
                <div className="metric">
                  <span className="metric-label">STATUS</span>
                  <span className={`metric-value metric-status status-text-${selectedBot.status}`}>
                    {selectedBot.status === 'online' ? <CircleCheck size={15} /> : selectedBot.status === 'connecting' || selectedBot.status === 'reconnecting' ? <LoaderCircle size={15} className="spin" /> : <Circle size={13} />}
                    {selectedBot.status}
                  </span>
                </div>
                <div className="metric">
                  <span className="metric-label">SERVER</span>
                  <span className="metric-value"><Server size={14} />{selectedBot.host}:{selectedBot.port}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">POSITION / DIMENSION</span>
                  <span className="metric-value">
                    <MapPin size={14} />
                    {selectedBot.position
                      ? `${selectedBot.position.x}, ${selectedBot.position.y}, ${selectedBot.position.z}${selectedBot.dimension ? ` · ${selectedBot.dimension}` : ''}`
                      : '—'}
                  </span>
                </div>
              </div>

              {selectedBot.lastError && <div className="error-banner">{selectedBot.lastError}</div>}

              <div className="log-heading">
                <div className="log-title"><Radio size={16} /><h3>Live stream</h3></div>
                <div className="stream-controls">
                  <button
                    type="button"
                    className="color-toggle"
                    title={chatColorsEnabled ? 'Disable chat colors' : 'Enable chat colors'}
                    aria-label={chatColorsEnabled ? 'Disable chat colors' : 'Enable chat colors'}
                    aria-pressed={chatColorsEnabled}
                    onClick={() => setChatColorsEnabled(enabled => !enabled)}
                  >
                    <Palette size={14} />
                  </button>
                  <span className="stream-indicator"><span className="status-dot status-online" /> LIVE</span>
                </div>
              </div>
              <div className="log-stream" role="log" aria-live="polite" aria-label="Bot chat and server messages">
                {selectedBot.logs?.length ? selectedBot.logs.map((entry, index) => (
                  <div className="log-line" key={`${entry.at}-${index}`}>
                    <time>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                    <span>{chatColorsEnabled && entry.colorRuns?.length
                      ? entry.colorRuns.map((run, runIndex) => (
                        <span
                          key={runIndex}
                          style={{
                            color: run.color || undefined,
                            fontWeight: run.bold ? 700 : undefined,
                            fontStyle: run.italic ? 'italic' : undefined,
                            textDecoration: run.underline ? 'underline' : undefined
                          }}
                        >{run.text}</span>
                      ))
                      : entry.text}</span>
                  </div>
                )) : (
                  <div className="empty-log">
                    <Terminal size={20} />
                    <span>Waiting for server messages</span>
                  </div>
                )}
                <div ref={logEndRef} />
              </div>

              <div className="command-area">
                <div className="command-topline">
                  <span className="panel-kicker"><Terminal size={13} /> SERVER CHAT / COMMAND</span>
                  <span className="command-target">TO {selectedBot.username}</span>
                </div>
                <div className="quick-commands">
                  {['/survival', '/hub1'].map(value => (
                    <button key={value} type="button" disabled={selectedBot.status !== 'online' || isPending('bot:command')} onClick={() => sendAction('bot:command', { command: value })}>
                      {value}<ArrowUpRight size={12} />
                    </button>
                  ))}
                </div>
                <div className="command-entry">
                  <form className="command-form" autoComplete="off" onSubmit={submitMessage}>
                    <input
                      ref={commandInputRef}
                      id="command-input"
                      name="minecraft-message"
                      role="combobox"
                      aria-label="Chat message or slash command"
                      aria-autocomplete="list"
                      aria-controls="command-suggestions"
                      aria-expanded={suggestions.length > 0}
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      onKeyDown={handleCommandKeyDown}
                      value={command}
                      onChange={event => setCommand(event.target.value)}
                      placeholder="Message or /command"
                      maxLength={256}
                      disabled={selectedBot.status !== 'online'}
                    />
                    <button type="submit" aria-label="Send message or command" title="Send message or command" disabled={selectedBot.status !== 'online' || !command.trim()}>
                      <Send size={16} />
                    </button>
                  </form>
                  {suggestions.length > 0 && (
                    <ul id="command-suggestions" className="command-suggestions" role="listbox" aria-label="Command suggestions">
                      {suggestions.map((suggestion, index) => (
                        <li key={`${suggestion}-${index}`} role="none">
                          <button
                            id={`command-suggestion-${index}`}
                            type="button"
                            role="option"
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => applySuggestion(suggestion)}
                          >
                            {suggestion}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {notice && <div className="notice" role="status">{notice}</div>}
              </div>
            </>
          ) : (
            <div className="no-selection">
              <div className="no-selection-mark"><Bot size={28} /></div>
              <span className="panel-kicker">FLEET EMPTY</span>
              <h2>Nothing on the wire.</h2>
              <p>No bot profiles configured.</p>
            </div>
          )}
        </section>
      </section>

      <footer className="app-footer">
        <span><span className="footer-mark" /> MINECLANK CONTROL</span>
        <span>{bots.length} CONFIGURED <span className="footer-separator">/</span> {onlineCount} ONLINE</span>
        <button
          className="theme-toggle"
          type="button"
          aria-label="Toggle dark mode"
          aria-pressed={activeTheme === 'dark'}
          onClick={toggleTheme}
        >
          {activeTheme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
          <span>{activeTheme === 'dark' ? 'Dark' : 'Light'}</span>
          <span className="theme-switch" aria-hidden="true"><span /></span>
        </button>
      </footer>
    </main>
  )
}

export default Dashboard