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
  Package,
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
const EQUIPMENT_SLOTS = [
  { slot: 5, label: 'Head' },
  { slot: 6, label: 'Chest' },
  { slot: 7, label: 'Legs' },
  { slot: 8, label: 'Feet' },
  { slot: 45, label: 'Offhand' },
]
const MAIN_INVENTORY_SLOTS = Array.from({ length: 27 }, (_, index) => 9 + index)
const HOTBAR_SLOTS = Array.from({ length: 9 }, (_, index) => 36 + index)

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
  const [activeView, setActiveView] = useState('stream')
  const [selectedInventorySlot, setSelectedInventorySlot] = useState(null)
  const [inventoryMoveSource, setInventoryMoveSource] = useState(null)
  const [confirmDropSlot, setConfirmDropSlot] = useState(null)
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
          setBots(current => current.map(bot => bot.id === message.bot.id
            ? { ...bot, ...message.bot, logs: bot.logs || [] }
            : bot))
          if (message.bot.status !== 'online') {
            completionRequestRef.current = null
            setSuggestions([])
            setInventoryMoveSource(null)
            setConfirmDropSlot(null)
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
          const actionMessages = {
            'bot:command': 'Message sent',
            'bot:inventory-move': 'Inventory stack moved',
            'bot:inventory-drop-one': 'Dropped one item',
            'bot:inventory-drop-stack': 'Dropped the stack'
          }
          const errorMessage = message.error === 'Unsupported action' && action === 'bot:complete'
            ? 'Restart the backend to enable command completion'
            : message.error
          setNotice(message.ok ? actionMessages[action] || 'Bot action complete' : errorMessage)
          window.setTimeout(() => setNotice(''), 3500)
        }
      })

      socket.addEventListener('close', () => {
        if (!active) return
        setConnection('offline')
        pendingRef.current = {}
        completionRequestRef.current = null
        setSuggestions([])
        setInventoryMoveSource(null)
        setConfirmDropSlot(null)
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
  const inventorySlots = selectedBot?.inventory || []
  const inventoryItemCount = inventorySlots.filter(Boolean).length
  const selectedInventoryItem = selectedInventorySlot === null ? null : inventorySlots[selectedInventorySlot]
  const isPending = action => Object.values(pending).includes(action)

  function handleInventorySlotClick(slot, item) {
    if (inventoryMoveSource !== null) {
      if (slot === inventoryMoveSource) {
        setInventoryMoveSource(null)
        return
      }
      if (item) {
        setNotice('Choose an empty destination slot')
        return
      }
      if (sendAction('bot:inventory-move', { sourceSlot: inventoryMoveSource, destinationSlot: slot })) {
        setInventoryMoveSource(null)
        setSelectedInventorySlot(null)
      }
      return
    }
    if (item) setSelectedInventorySlot(slot)
  }

  function renderInventorySlot(slot, label) {
    const item = inventorySlots[slot]
    const description = item
      ? `${item.count} x ${item.customName || item.displayName || item.name}`
      : 'Empty'
    const canChooseDestination = inventoryMoveSource !== null && !item && selectedBot?.status === 'online'

    return (
      <button
        type="button"
        className={`inventory-slot ${item ? 'filled' : ''} ${canChooseDestination ? 'move-target' : ''} ${selectedInventorySlot === slot ? 'selected' : ''}`}
        key={slot}
        role="gridcell"
        aria-label={`${label}: ${description}`}
        aria-pressed={selectedInventorySlot === slot}
        title={`${label}: ${description}`}
        disabled={selectedBot?.status !== 'online' || (!item && inventoryMoveSource === null)}
        onClick={() => handleInventorySlotClick(slot, item)}
      >
        <span className="inventory-slot-label">{label}</span>
        {item && (
          <>
            <span className="inventory-item-name">{item.customName || item.displayName || item.name}</span>
            {item.count > 1 && <span className="inventory-item-count">{item.count}</span>}
          </>
        )}
        {canChooseDestination && <span className="inventory-move-target-mark">MOVE HERE</span>}
      </button>
    )
  }

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

  function renderLogText(entry) {
    const text = entry.text || ''
    const runsLength = entry.colorRuns?.reduce((length, run) => length + run.text.length, 0)
    const runs = chatColorsEnabled && runsLength === text.length
      ? entry.colorRuns
      : [{ text, color: null, bold: false, italic: false, underline: false }]

    const renderRange = (start, end, keyPrefix) => {
      let offset = 0
      return runs.flatMap((run, runIndex) => {
        const runStart = offset
        offset += run.text.length
        const rangeStart = Math.max(start, runStart)
        const rangeEnd = Math.min(end, offset)
        if (rangeStart >= rangeEnd) return []

        return [(
          <span
            key={`${keyPrefix}-${runIndex}`}
            style={{
              color: run.color || undefined,
              fontWeight: run.bold ? 700 : undefined,
              fontStyle: run.italic ? 'italic' : undefined,
              textDecoration: run.underline ? 'underline' : undefined
            }}
          >{run.text.slice(rangeStart - runStart, rangeEnd - runStart)}</span>
        )]
      })
    }

    const matches = [...text.matchAll(/\/[a-zA-Z ]+/g)]
    if (!matches.length) return renderRange(0, text.length, 'text')

    const nodes = []
    let cursor = 0
    for (const [index, match] of matches.entries()) {
      const start = match.index
      const end = start + match[0].length
      const command = match[0].trim()
      if (start > cursor) {
        nodes.push(<span key={`text-${cursor}`}>{renderRange(cursor, start, `text-${cursor}`)}</span>)
      }
      nodes.push(
        <button
          key={`command-${index}-${start}`}
          type="button"
          className="chat-command"
          title={`Fill command box with ${command}`}
          aria-label={`Fill command box with ${command}`}
          onClick={() => {
            setCommand(command)
            setSuggestions([])
            commandInputRef.current?.focus()
          }}
        >{renderRange(start, end, `command-${index}-${start}`)}</button>
      )
      cursor = end
    }
    if (cursor < text.length) {
      nodes.push(<span key={`text-${cursor}`}>{renderRange(cursor, text.length, `text-${cursor}`)}</span>)
    }
    return nodes
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
                onClick={() => {
                  setSelectedId(bot.id)
                  setSelectedInventorySlot(null)
                  setInventoryMoveSource(null)
                  setConfirmDropSlot(null)
                }}
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

              <div className="detail-view-header">
                <div className="detail-tabs" role="tablist" aria-label="Bot views">
                  <button
                    id="stream-tab"
                    type="button"
                    role="tab"
                    aria-selected={activeView === 'stream'}
                    aria-controls="stream-panel"
                    className={`detail-tab ${activeView === 'stream' ? 'selected' : ''}`}
                    onClick={() => setActiveView('stream')}
                  >
                    <Radio size={15} /> Live stream
                  </button>
                  <button
                    id="inventory-tab"
                    type="button"
                    role="tab"
                    aria-selected={activeView === 'inventory'}
                    aria-controls="inventory-panel"
                    className={`detail-tab ${activeView === 'inventory' ? 'selected' : ''}`}
                    onClick={() => setActiveView('inventory')}
                  >
                    <Package size={15} /> Inventory
                    <span className="tab-count">{inventoryItemCount}</span>
                  </button>
                </div>
                {activeView === 'stream' && (
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
                )}
              </div>

              {activeView === 'stream' ? (
                <div className="log-stream detail-view" id="stream-panel" role="tabpanel" aria-labelledby="stream-tab" aria-live="polite" aria-label="Bot chat and server messages">
                  {selectedBot.logs?.length ? selectedBot.logs.map((entry, index) => (
                    <div className="log-line" key={`${entry.at}-${index}`}>
                      <time>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                      <span>{renderLogText(entry)}</span>
                    </div>
                  )) : (
                    <div className="empty-log">
                      <Terminal size={20} />
                      <span>Waiting for server messages</span>
                    </div>
                  )}
                  <div ref={logEndRef} />
                </div>
              ) : (
                <section className="inventory-view detail-view" id="inventory-panel" role="tabpanel" aria-labelledby="inventory-tab">
                  <div className="inventory-summary">
                    <div>
                      <span className="panel-kicker">PLAYER INVENTORY</span>
                      <h3>Items</h3>
                    </div>
                    <span className="inventory-total">{inventoryItemCount} occupied slots</span>
                  </div>
                  {selectedBot.status !== 'online' || inventorySlots.length === 0 ? (
                    <div className="inventory-empty">Inventory data is available while the bot is online.</div>
                  ) : (
                    <>
                      <section className="inventory-section" aria-label="Equipment">
                        <div className="inventory-section-heading"><h4>Equipment</h4><span>Armor and offhand</span></div>
                        <div className="equipment-grid" role="grid">
                          {EQUIPMENT_SLOTS.map(({ slot, label }) => renderInventorySlot(slot, label))}
                        </div>
                      </section>
                      <section className="inventory-section" aria-label="Main inventory">
                        <div className="inventory-section-heading"><h4>Storage</h4><span>27 slots</span></div>
                        <div className="inventory-grid" role="grid">
                          {MAIN_INVENTORY_SLOTS.map(slot => renderInventorySlot(slot, String(slot - 8)))}
                        </div>
                      </section>
                      <section className="inventory-section" aria-label="Hotbar">
                        <div className="inventory-section-heading"><h4>Hotbar</h4><span>Selected items</span></div>
                        <div className="inventory-grid hotbar-grid" role="grid">
                          {HOTBAR_SLOTS.map(slot => renderInventorySlot(slot, String(slot - 35)))}
                        </div>
                      </section>
                      {selectedInventoryItem ? (
                        <section className="inventory-item-details" aria-label="Selected item details">
                          <div className="inventory-detail-heading">
                            <span className="panel-kicker">SLOT {selectedInventorySlot}</span>
                            <strong>{selectedInventoryItem.customName || selectedInventoryItem.displayName || selectedInventoryItem.name}</strong>
                            <span className="inventory-total">{selectedInventoryItem.count} item(s)</span>
                          </div>
                          {selectedInventoryItem.enchantments?.length > 0 && (
                            <div className="inventory-detail-group">
                              <span className="inventory-detail-label">ENCHANTMENTS</span>
                              <ul>{selectedInventoryItem.enchantments.map((enchantment, index) => (
                                <li key={`${enchantment.name}-${index}`}>{enchantment.name} {enchantment.level}</li>
                              ))}</ul>
                            </div>
                          )}
                          {selectedInventoryItem.lore?.length > 0 && (
                            <div className="inventory-detail-group">
                              <span className="inventory-detail-label">LORE</span>
                              <ul>{selectedInventoryItem.lore.map((line, index) => <li key={index}>{line}</li>)}</ul>
                            </div>
                          )}
                          {!selectedInventoryItem.customName && !selectedInventoryItem.enchantments?.length && !selectedInventoryItem.lore?.length && (
                            <span className="inventory-select-hint">No custom name, enchantments, or lore</span>
                          )}
                          <div className="inventory-item-actions">
                            {inventoryMoveSource === selectedInventorySlot ? (
                              <button type="button" className="inventory-action-button" onClick={() => setInventoryMoveSource(null)}>Cancel move</button>
                            ) : (
                              <button
                                type="button"
                                className="inventory-action-button"
                                disabled={selectedBot.status !== 'online' || isPending('bot:inventory-move')}
                                onClick={() => setInventoryMoveSource(selectedInventorySlot)}
                              >Move
                              </button>
                            )}
                            <button
                              type="button"
                              className="inventory-action-button"
                              disabled={selectedBot.status !== 'online' || isPending('bot:inventory-drop-one')}
                              onClick={() => sendAction('bot:inventory-drop-one', { slot: selectedInventorySlot })}
                            >Drop 1</button>
                            <button
                              type="button"
                              className="inventory-action-button inventory-drop-stack-button"
                              disabled={selectedBot.status !== 'online' || isPending('bot:inventory-drop-stack')}
                              onClick={() => setConfirmDropSlot(selectedInventorySlot)}
                            >Drop stack</button>
                          </div>
                        </section>
                      ) : (
                        <div className="inventory-select-hint">Select an occupied slot to inspect custom item data.</div>
                      )}
                      {inventoryMoveSource !== null && (
                        <div className="inventory-move-notice" role="status">
                          Select an empty slot to move this stack, or cancel the move.
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}

              {confirmDropSlot !== null && (
                <div className="inventory-confirm-backdrop">
                  <section className="inventory-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="drop-stack-title">
                    <span className="panel-kicker">CONFIRM DROP</span>
                    <h3 id="drop-stack-title">Drop entire stack?</h3>
                    <p>
                      {inventorySlots[confirmDropSlot]
                        ? `Drop all ${inventorySlots[confirmDropSlot].count} x ${inventorySlots[confirmDropSlot].customName || inventorySlots[confirmDropSlot].displayName || inventorySlots[confirmDropSlot].name}?`
                        : 'That item is no longer in the selected slot.'}
                    </p>
                    <div className="inventory-confirm-actions">
                      <button type="button" className="inventory-action-button" onClick={() => setConfirmDropSlot(null)}>Cancel</button>
                      <button
                        type="button"
                        className="inventory-action-button inventory-drop-stack-button"
                        disabled={!inventorySlots[confirmDropSlot] || isPending('bot:inventory-drop-stack')}
                        onClick={() => {
                          if (sendAction('bot:inventory-drop-stack', { slot: confirmDropSlot })) {
                            setConfirmDropSlot(null)
                            setSelectedInventorySlot(null)
                          }
                        }}
                      >Drop stack</button>
                    </div>
                  </section>
                </div>
              )}

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