import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Bot,
  BookOpen,
  Circle,
  CircleCheck,
  Drumstick,
  Gamepad2,
  Heart,
  LoaderCircle,
  MapPin,
  Moon,
  Package,
  PanelsTopLeft,
  Palette,
  Play,
  Plus,
  Pencil,
  Radio,
  Save,
  Search,
  Send,
  Server,
  Square,
  Sparkles,
  Timer,
  Trash2,
  Sun,
  Terminal,
  Wifi,
  WifiOff,
  Wind,
  X,
} from 'lucide-react'
import { createRequestId, getWebSocketUrl } from './client.js'
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
const savedPlaceholderPattern = /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g
const ITEM_SPRITE_MAP_CATEGORIES = new Set([
  'blocks-overworld', 'blocks-nether', 'blocks-end', 'blocks-other',
  'materials', 'equipment', 'spawn-eggs', 'food', 'transport'
])

function ItemCategoryIcon({ category, name, enchanted = false }) {
  const categoryKey = ITEM_SPRITE_MAP_CATEGORIES.has(category) ? category : 'materials'
  const [failedItemIcon, setFailedItemIcon] = useState(null)
  const hasSprite = name && !name.includes(':') && failedItemIcon !== name

  return (
    <span className={`inventory-icon-wrap ${enchanted ? 'is-enchanted' : ''}`} aria-hidden="true">
      {hasSprite && (
      <svg className="inventory-category-icon inventory-category-icon-sprite" viewBox="0 0 16 16" aria-hidden="true">
        <use href={`/local-item-icons/${categoryKey}-sprites.svg#${encodeURIComponent(name)}`} onError={() => setFailedItemIcon(name)} />
      </svg>
      )}
    </span>
  )
}

function savedMessageVariables(message) {
  return [...new Set([...message.matchAll(savedPlaceholderPattern)].map(match => match[1]))]
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const remainingMinutes = minutes % 60
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${remainingMinutes}m`
  return `${remainingMinutes}m`
}

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
  const [savedMessages, setSavedMessages] = useState([])
  const [savedMessageSearch, setSavedMessageSearch] = useState('')
  const [savedMessageCategory, setSavedMessageCategory] = useState('all')
  const [savedMessageDraft, setSavedMessageDraft] = useState(null)
  const [savedMessageToDelete, setSavedMessageToDelete] = useState(null)
  const [savedMessageToFill, setSavedMessageToFill] = useState(null)
  const [savedMessageValues, setSavedMessageValues] = useState({})
  const [savedMessageFillError, setSavedMessageFillError] = useState('')
  const socketRef = useRef(null)
  const pendingRef = useRef({})
  const completionRequestRef = useRef(null)
  const openWindowsRef = useRef({})
  const commandHistoryRef = useRef({})
  const historyNavigationRef = useRef(null)
  const completionTimerRef = useRef(null)
  const commandInputRef = useRef(null)
  const logStreamRef = useRef(null)

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
          openWindowsRef.current = Object.fromEntries(message.bots.map(bot => [bot.id, Boolean(bot.openWindow)]))
        } else if (message.type === 'saved-messages:snapshot' || message.type === 'saved-messages:update') {
          setSavedMessages(message.messages)
        } else if (message.type === 'bot:state') {
          const hadWindow = Boolean(openWindowsRef.current[message.bot.id])
          const hasWindow = Boolean(message.bot.openWindow)
          openWindowsRef.current[message.bot.id] = hasWindow
          if (hasWindow && !hadWindow) {
            setSelectedId(message.bot.id)
            setActiveView('menu')
          } else if (!hasWindow && hadWindow) {
            setActiveView(current => current === 'menu' ? 'stream' : current)
          }
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
            'bot:inventory-drop-stack': 'Dropped the stack',
            'bot:window-click': 'Server menu clicked',
            'bot:window-close': 'Server menu closed',
            'saved-message:create': 'Saved message added',
            'saved-message:update': 'Saved message updated',
            'saved-message:delete': 'Saved message deleted'
          }
          const errorMessage = message.error === 'Unsupported action' && action === 'bot:complete'
            ? 'Restart the backend to enable command completion'
            : message.error
          setNotice(message.ok ? actionMessages[action] || 'Bot action complete' : errorMessage)
          if (message.ok && ['saved-message:create', 'saved-message:update', 'saved-message:delete'].includes(action)) {
            setSavedMessageDraft(null)
            setSavedMessageToDelete(null)
          }
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
  const openWindow = selectedBot?.openWindow || null
  const menuItemCount = openWindow?.slots
    ?.slice(0, openWindow.inventoryStart)
    .filter(Boolean).length || 0
  const selectedInventoryItem = selectedInventorySlot === null ? null : inventorySlots[selectedInventorySlot]
  const isPending = action => Object.values(pending).includes(action)
  const savedMessageCategories = [...new Set(savedMessages.map(entry => entry.category).filter(Boolean))]
  const filteredSavedMessages = savedMessages.filter(entry => {
    const matchesCategory = savedMessageCategory === 'all' || entry.category === savedMessageCategory
    const search = savedMessageSearch.trim().toLocaleLowerCase()
    const matchesSearch = !search ||
      `${entry.title} ${entry.category} ${entry.message}`.toLocaleLowerCase().includes(search)
    return matchesCategory && matchesSearch
  })

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
            <ItemCategoryIcon category={item.category} name={item.name} enchanted={item.hasEnchantmentGlint ?? Boolean(item.enchantments?.length)} />
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
    const requestId = createRequestId()
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

  useLayoutEffect(() => {
    if (activeView === 'stream' && logStreamRef.current) {
      logStreamRef.current.scrollTop = logStreamRef.current.scrollHeight
    }
  }, [activeView, selectedBot?.id, selectedBot?.logs?.length])

  function sendAction(type, values = {}) {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setNotice('Control service is offline')
      return false
    }
    const requestId = createRequestId()
    pendingRef.current[requestId] = type
    setPending({ ...pendingRef.current })
    socketRef.current.send(JSON.stringify({ type, id: selectedBot?.id, requestId, ...values }))
    if (type === 'bot:command' && selectedBot?.id && typeof values.command === 'string') {
      const history = commandHistoryRef.current[selectedBot.id] || []
      commandHistoryRef.current[selectedBot.id] = [...history, values.command].slice(-100)
      historyNavigationRef.current = null
    }
    return true
  }

  function fillSavedMessage(entry, values = {}) {
    const message = entry.message.replace(savedPlaceholderPattern, (_match, name) => values[name] ?? '')
    if (message.length > 256) {
      setSavedMessageFillError('The completed message exceeds Minecraft’s 256-character chat limit.')
      return false
    }
    setCommand(message)
    historyNavigationRef.current = null
    setSavedMessageToFill(null)
    setSavedMessageValues({})
    setSavedMessageFillError('')
    commandInputRef.current?.focus()
    return true
  }

  function chooseSavedMessage(entry) {
    const variables = savedMessageVariables(entry.message)
    if (!variables.length) {
      fillSavedMessage(entry)
      return
    }
    setSavedMessageToFill(entry)
    setSavedMessageValues(Object.fromEntries(variables.map(name => [name, ''])))
    setSavedMessageFillError('')
  }

  function saveSavedMessage(event) {
    event.preventDefault()
    if (!savedMessageDraft) return
    const type = savedMessageDraft.id ? 'saved-message:update' : 'saved-message:create'
    sendAction(type, {
      ...(savedMessageDraft.id ? { messageId: savedMessageDraft.id } : {}),
      entry: {
        title: savedMessageDraft.title,
        category: savedMessageDraft.category,
        message: savedMessageDraft.message
      }
    })
  }

  function confirmDeleteSavedMessage() {
    if (!savedMessageToDelete) return
    sendAction('saved-message:delete', { messageId: savedMessageToDelete.id })
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
    historyNavigationRef.current = null
    setSuggestions([])
    commandInputRef.current?.focus()
  }

  function handleCommandKeyDown(event) {
    if (event.key === 'ArrowUp' && !suggestions.length && selectedBot?.id) {
      const history = commandHistoryRef.current[selectedBot.id] || []
      if (!history.length) return
      event.preventDefault()

      const navigation = historyNavigationRef.current
      const current = navigation?.botId === selectedBot.id
        ? navigation
        : { botId: selectedBot.id, index: history.length, draft: command }
      const index = Math.max(0, current.index - 1)
      historyNavigationRef.current = { ...current, index }
      setCommand(history[index])
    } else if (event.key === 'ArrowDown' && !suggestions.length) {
      const navigation = historyNavigationRef.current
      if (navigation?.botId !== selectedBot?.id) return
      event.preventDefault()
      const history = commandHistoryRef.current[selectedBot.id] || []
      if (navigation.index < history.length - 1) {
        const index = navigation.index + 1
        historyNavigationRef.current = { ...navigation, index }
        setCommand(history[index])
      } else {
        historyNavigationRef.current = null
        setCommand(navigation.draft)
      }
    } else if (event.key === 'Escape') {
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

    const interactions = [
      ...[...text.matchAll(/\/[a-zA-Z ]+/g)].map(match => ({
        start: match.index,
        end: match.index + match[0].length,
        type: 'command',
        command: match[0].trim()
      })),
      ...(entry.playerLinks || [])
        .filter(link => (
          Number.isInteger(link.start) &&
          Number.isInteger(link.end) &&
          link.start >= 0 &&
          link.end > link.start &&
          link.end <= text.length &&
          /^[A-Za-z0-9_]{1,16}$/.test(link.username)
        ))
        .map(link => ({ ...link, type: 'player' }))
    ].sort((a, b) => a.start - b.start || a.end - b.end)
    if (!interactions.length) return renderRange(0, text.length, 'text')

    const nodes = []
    let cursor = 0
    for (const [index, interaction] of interactions.entries()) {
      const { start, end } = interaction
      if (start < cursor) continue
      if (start > cursor) {
        nodes.push(<span key={`text-${cursor}`}>{renderRange(cursor, start, `text-${cursor}`)}</span>)
      }
      nodes.push(
        <button
          key={`${interaction.type}-${index}-${start}`}
          type="button"
          className={interaction.type === 'player' ? 'chat-player' : 'chat-command'}
          title={interaction.type === 'player'
            ? `Minecraft username: ${interaction.username}`
            : `Fill command box with ${interaction.command}`}
          aria-label={interaction.type === 'player'
            ? `Message ${interaction.username}`
            : `Fill command box with ${interaction.command}`}
          onClick={() => {
            historyNavigationRef.current = null
            setCommand(interaction.type === 'player'
              ? `/msg ${interaction.username} `
              : interaction.command)
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

              <section className="player-stats" aria-label="Player status">
                <h3 className="player-stats-heading">PLAYER STATUS</h3>
                <div className="player-stats-grid">
                  <div className="player-stat">
                    <span className="player-stat-label"><Heart size={13} /> HEALTH</span>
                    <strong>{Number.isFinite(selectedBot.playerStats?.health)
                      ? `${selectedBot.playerStats.health} HP`
                      : '—'}</strong>
                  </div>
                  <div className="player-stat">
                    <span className="player-stat-label"><Drumstick size={13} /> HUNGER</span>
                    <strong>{Number.isFinite(selectedBot.playerStats?.food)
                      ? `${selectedBot.playerStats.food} / 20`
                      : '—'}</strong>
                    <small>{Number.isFinite(selectedBot.playerStats?.foodSaturation)
                      ? `Saturation ${selectedBot.playerStats.foodSaturation}`
                      : ' '}</small>
                  </div>
                  <div className="player-stat">
                    <span className="player-stat-label"><Wind size={13} /> AIR</span>
                    <strong>{Number.isFinite(selectedBot.playerStats?.oxygenLevel)
                      ? `${selectedBot.playerStats.oxygenLevel} / 20`
                      : '—'}</strong>
                  </div>
                  <div className="player-stat">
                    <span className="player-stat-label"><Sparkles size={13} /> EXPERIENCE</span>
                    <strong>{Number.isFinite(selectedBot.playerStats?.experienceLevel)
                      ? `Level ${selectedBot.playerStats.experienceLevel}`
                      : '—'}</strong>
                    <small>{Number.isFinite(selectedBot.playerStats?.experienceProgress)
                      ? `${Math.round(selectedBot.playerStats.experienceProgress * 100)}% to next level`
                      : ' '}</small>
                  </div>
                  <div className="player-stat">
                    <span className="player-stat-label"><Gamepad2 size={13} /> GAME MODE</span>
                    <strong>{selectedBot.playerStats?.gameMode
                      ? selectedBot.playerStats.gameMode[0].toUpperCase() + selectedBot.playerStats.gameMode.slice(1)
                      : '—'}</strong>
                  </div>
                  <div className="player-stat">
                    <span className="player-stat-label"><Activity size={13} /> PLAYER</span>
                    <strong>{selectedBot.playerStats?.isAlive === null || selectedBot.playerStats?.isAlive === undefined
                      ? '—'
                      : selectedBot.playerStats.isAlive
                        ? selectedBot.playerStats.isSleeping ? 'Sleeping' : 'Alive'
                        : 'Dead'}</strong>
                  </div>
                  <div className="player-stat">
                    <span className="player-stat-label"><Timer size={13} /> SESSION TIME</span>
                    <strong>{selectedBot.status === 'online'
                      ? formatDuration(selectedBot.uptimeSeconds)
                      : '—'}</strong>
                  </div>
                </div>
              </section>

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
                  <button
                    id="saved-messages-tab"
                    type="button"
                    role="tab"
                    aria-selected={activeView === 'saved'}
                    aria-controls="saved-messages-panel"
                    className={`detail-tab ${activeView === 'saved' ? 'selected' : ''}`}
                    onClick={() => setActiveView('saved')}
                  >
                    <BookOpen size={15} /> Saved Messages
                    <span className="tab-count">{savedMessages.length}</span>
                  </button>
                  {openWindow && (
                    <button
                      id="menu-tab"
                      type="button"
                      role="tab"
                      aria-selected={activeView === 'menu'}
                      aria-controls="menu-panel"
                      className={`detail-tab ${activeView === 'menu' ? 'selected' : ''}`}
                      onClick={() => setActiveView('menu')}
                    >
                      <PanelsTopLeft size={15} /> Server Menu
                      <span className="tab-count">{menuItemCount}</span>
                    </button>
                  )}
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
                <div ref={logStreamRef} className="log-stream detail-view" id="stream-panel" role="tabpanel" aria-labelledby="stream-tab" aria-live="polite" aria-label="Bot chat and server messages">
                  {selectedBot.logs?.length ? selectedBot.logs.map((entry, index) => (
                    <div className="log-line" key={`${entry.at}-${index}`}>
                      <time>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</time>
                      <span>{renderLogText(entry)}</span>
                    </div>
                  )) : (
                    <div className="empty-log">
                      <Terminal size={20} />
                      <span>Waiting for server messages</span>
                    </div>
                  )}
                </div>
              ) : activeView === 'inventory' ? (
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
              ) : activeView === 'saved' ? (
                <section className="saved-messages-view detail-view" id="saved-messages-panel" role="tabpanel" aria-labelledby="saved-messages-tab">
                  <div className="saved-messages-heading">
                    <div>
                      <span className="panel-kicker">REUSABLE CHAT / COMMANDS</span>
                      <h3>Saved Messages</h3>
                    </div>
                    <button
                      type="button"
                      className="inventory-action-button saved-add-button"
                      onClick={() => setSavedMessageDraft({ id: null, title: '', category: '', message: '' })}
                    ><Plus size={14} /> Add message</button>
                  </div>
                  <div className="saved-message-filters">
                    <label className="saved-message-search">
                      <Search size={14} />
                      <input
                        type="search"
                        aria-label="Search saved messages"
                        placeholder="Search title, category, or text"
                        value={savedMessageSearch}
                        onChange={event => setSavedMessageSearch(event.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filter by category"
                      value={savedMessageCategory}
                      onChange={event => setSavedMessageCategory(event.target.value)}
                    >
                      <option value="all">All categories</option>
                      {savedMessageCategories.map(category => <option key={category} value={category}>{category}</option>)}
                      {savedMessages.some(entry => !entry.category) && <option value="">Uncategorized</option>}
                    </select>
                  </div>
                  {filteredSavedMessages.length ? (
                    <div className="saved-message-list">
                      {filteredSavedMessages.map(entry => (
                        <article className="saved-message-card" key={entry.id}>
                          <button
                            type="button"
                            className="saved-message-insert"
                            title="Fill the chat box without sending"
                            onClick={() => chooseSavedMessage(entry)}
                          >
                            <span className="saved-message-card-heading">
                              <strong>{entry.title}</strong>
                              <span>{entry.category || 'Uncategorized'}</span>
                            </span>
                            <span className="saved-message-preview">{entry.message}</span>
                          </button>
                          <div className="saved-message-card-actions">
                            <button
                              type="button"
                              aria-label={`Edit ${entry.title}`}
                              title="Edit"
                              onClick={() => setSavedMessageDraft({ ...entry })}
                            ><Pencil size={14} /></button>
                            <button
                              type="button"
                              aria-label={`Delete ${entry.title}`}
                              title="Delete"
                              onClick={() => setSavedMessageToDelete(entry)}
                            ><Trash2 size={14} /></button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="saved-messages-empty">
                      <BookOpen size={20} />
                      <span>{savedMessages.length ? 'No saved messages match this filter.' : 'No saved messages yet. Add one to get started.'}</span>
                    </div>
                  )}
                  <p className="saved-message-hint">Select a message to fill the chat box. It will not be sent until you press Send.</p>
                </section>
              ) : openWindow ? (
                <section className="menu-view detail-view" id="menu-panel" role="tabpanel" aria-labelledby="menu-tab">
                  <div className="inventory-summary">
                    <div className="menu-title">
                      <span className="panel-kicker">SERVER MENU / {openWindow.type}</span>
                      <h3>{openWindow.title}</h3>
                    </div>
                    <button
                      type="button"
                      className="inventory-action-button menu-close-button"
                      disabled={isPending('bot:window-close')}
                      onClick={() => sendAction('bot:window-close', { windowId: openWindow.id })}
                    ><X size={14} /> Close menu</button>
                  </div>
                  <section className="inventory-section" aria-label="Server menu items">
                    <div className="inventory-section-heading">
                      <h4>Menu items</h4>
                      <span>{menuItemCount} items · click to interact</span>
                    </div>
                    <div className="inventory-grid menu-slot-grid" role="grid" aria-label="Server menu slots">
                      {openWindow.slots.slice(0, openWindow.inventoryStart).map((item, slot) => {
                        const name = item
                          ? item.customName || item.displayName || item.name
                          : 'Empty'
                        const description = item
                          ? `${item.count} x ${name}${item.lore?.length ? `\n${item.lore.join('\n')}` : ''}`
                          : 'Empty menu slot'
                        return (
                          <button
                            key={slot}
                            type="button"
                            className={`inventory-slot menu-slot ${item ? 'filled' : ''}`}
                            role="gridcell"
                            aria-label={`Menu slot ${slot}: ${item ? `${item.count} x ${name}` : 'empty'}`}
                            title={description}
                            disabled={selectedBot.status !== 'online' || isPending('bot:window-click')}
                            onClick={event => sendAction('bot:window-click', {
                              windowId: openWindow.id,
                              slot,
                              mouseButton: 0,
                              mode: event.shiftKey ? 1 : 0
                            })}
                            onContextMenu={event => {
                              event.preventDefault()
                              sendAction('bot:window-click', {
                                windowId: openWindow.id,
                                slot,
                                mouseButton: 1,
                                mode: event.shiftKey ? 1 : 0
                              })
                            }}
                          >
                            <span className="inventory-slot-label">{slot + 1}</span>
                            {item && (
                              <>
                                <ItemCategoryIcon category={item.category} name={item.name} enchanted={item.hasEnchantmentGlint ?? Boolean(item.enchantments?.length)} />
                                <span className="inventory-item-name">{name}</span>
                                {item.count > 1 && <span className="inventory-item-count">{item.count}</span>}
                              </>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                  {openWindow.slots.length > openWindow.inventoryStart && (
                    <section className="inventory-section" aria-label="Player inventory in server menu">
                      <div className="inventory-section-heading">
                        <h4>Your inventory</h4>
                        <span>Click · right-click · shift-click</span>
                      </div>
                      <div className="inventory-grid menu-slot-grid" role="grid" aria-label="Player inventory slots">
                        {openWindow.slots.slice(openWindow.inventoryStart).map((item, index) => {
                          const slot = openWindow.inventoryStart + index
                          const name = item ? item.customName || item.displayName || item.name : 'Empty'
                          return (
                            <button
                              key={slot}
                              type="button"
                              className={`inventory-slot menu-slot ${item ? 'filled' : ''}`}
                              role="gridcell"
                              aria-label={`Inventory slot ${slot}: ${item ? `${item.count} x ${name}` : 'empty'}`}
                              title={item ? `${item.count} x ${name}` : 'Empty'}
                              disabled={selectedBot.status !== 'online' || isPending('bot:window-click')}
                              onClick={event => sendAction('bot:window-click', {
                                windowId: openWindow.id,
                                slot,
                                mouseButton: 0,
                                mode: event.shiftKey ? 1 : 0
                              })}
                              onContextMenu={event => {
                                event.preventDefault()
                                sendAction('bot:window-click', {
                                  windowId: openWindow.id,
                                  slot,
                                  mouseButton: 1,
                                  mode: event.shiftKey ? 1 : 0
                                })
                              }}
                            >
                              <span className="inventory-slot-label">{slot + 1}</span>
                              {item && (
                                <>
                                  <ItemCategoryIcon category={item.category} name={item.name} enchanted={item.hasEnchantmentGlint ?? Boolean(item.enchantments?.length)} />
                                  <span className="inventory-item-name">{name}</span>
                                  {item.count > 1 && <span className="inventory-item-count">{item.count}</span>}
                                </>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  )}
                  <p className="menu-help">
                    Left-click to pick up or place items. Right-click for half-stack actions; hold Shift while clicking to transfer between inventories.
                    {openWindow.selectedItem
                      ? ` On cursor: ${openWindow.selectedItem.count} x ${openWindow.selectedItem.customName || openWindow.selectedItem.displayName || openWindow.selectedItem.name}.`
                      : ' Cursor: empty.'}
                  </p>
                </section>
              ) : (
                <div className="inventory-empty">No server menu is open.</div>
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

              {savedMessageDraft && (
                <div className="saved-message-backdrop">
                  <form className="saved-message-dialog" onSubmit={saveSavedMessage}>
                    <span className="panel-kicker">{savedMessageDraft.id ? 'EDIT ENTRY' : 'NEW ENTRY'}</span>
                    <h3>{savedMessageDraft.id ? 'Edit saved message' : 'Add saved message'}</h3>
                    <label>
                      <span>Title</span>
                      <input
                        autoFocus
                        required
                        maxLength={80}
                        value={savedMessageDraft.title}
                        onChange={event => setSavedMessageDraft(current => ({ ...current, title: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>Category</span>
                      <input
                        maxLength={40}
                        placeholder="Optional"
                        value={savedMessageDraft.category}
                        onChange={event => setSavedMessageDraft(current => ({ ...current, category: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>Message or command <small>{savedMessageDraft.message.length}/256</small></span>
                      <input
                        type="text"
                        required
                        maxLength={256}
                        value={savedMessageDraft.message}
                        onChange={event => setSavedMessageDraft(current => ({ ...current, message: event.target.value }))}
                      />
                    </label>
                    <p className="saved-message-hint">Use placeholders like {'{{player}}'}; values are requested when you select this entry.</p>
                    <div className="saved-message-form-actions">
                      <button type="button" className="inventory-action-button" onClick={() => setSavedMessageDraft(null)}>Cancel</button>
                      <button type="submit" className="inventory-action-button saved-message-save" disabled={isPending(savedMessageDraft.id ? 'saved-message:update' : 'saved-message:create')}>
                        <Save size={14} /> Save
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {savedMessageToFill && (
                <div className="saved-message-backdrop">
                  <form
                    className="saved-message-dialog"
                    onSubmit={event => {
                      event.preventDefault()
                      fillSavedMessage(savedMessageToFill, savedMessageValues)
                    }}
                  >
                    <span className="panel-kicker">FILL MESSAGE</span>
                    <h3>{savedMessageToFill.title}</h3>
                    {Object.keys(savedMessageValues).map(name => (
                      <label key={name}>
                        <span>{name}</span>
                        <input
                          autoFocus={name === Object.keys(savedMessageValues)[0]}
                          value={savedMessageValues[name]}
                          onChange={event => setSavedMessageValues(current => ({ ...current, [name]: event.target.value }))}
                        />
                      </label>
                    ))}
                    {savedMessageFillError && <p className="saved-message-error" role="alert">{savedMessageFillError}</p>}
                    <div className="saved-message-form-actions">
                      <button type="button" className="inventory-action-button" onClick={() => setSavedMessageToFill(null)}>Cancel</button>
                      <button type="submit" className="inventory-action-button saved-message-save">Fill chat box</button>
                    </div>
                  </form>
                </div>
              )}

              {savedMessageToDelete && (
                <div className="saved-message-backdrop">
                  <section className="saved-message-dialog" role="alertdialog" aria-modal="true" aria-labelledby="saved-message-delete-title">
                    <span className="panel-kicker">DELETE ENTRY</span>
                    <h3 id="saved-message-delete-title">Delete {savedMessageToDelete.title}?</h3>
                    <p>This cannot be undone.</p>
                    <div className="saved-message-form-actions">
                      <button type="button" className="inventory-action-button" onClick={() => setSavedMessageToDelete(null)}>Cancel</button>
                      <button type="button" className="inventory-action-button inventory-drop-stack-button" disabled={isPending('saved-message:delete')} onClick={confirmDeleteSavedMessage}>
                        <Trash2 size={14} /> Delete
                      </button>
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
                      aria-describedby="command-history-hint"
                      aria-expanded={suggestions.length > 0}
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      onKeyDown={handleCommandKeyDown}
                      value={command}
                      onChange={event => {
                        historyNavigationRef.current = null
                        setCommand(event.target.value)
                      }}
                      placeholder="Message or /command"
                      maxLength={256}
                      disabled={selectedBot.status !== 'online'}
                    />
                    <button type="submit" aria-label="Send message or command" title="Send message or command" disabled={selectedBot.status !== 'online' || !command.trim()}>
                      <Send size={16} />
                    </button>
                  </form>
                  <span id="command-history-hint" className="command-history-hint">Use ↑ / ↓ for the last 100 sent messages and commands</span>
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