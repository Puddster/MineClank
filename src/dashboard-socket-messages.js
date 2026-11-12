const actionMessages = {
  'bot:command': 'Message sent',
  'bot:auto-start': 'Auto-start setting saved',
  'bot:auth-reset': 'Microsoft login cache cleared',
  'bot:auth-start': 'Microsoft sign-in started',
  'bot:skin-refresh': 'Skin refreshed',
  'bot:profile-create': 'Bot profile added',
  'bot:profile-update': 'Bot profile updated',
  'bot:profile-delete': 'Bot profile deleted',
  'bot:inventory-click': 'Inventory clicked',
  'bot:inventory-move': 'Inventory updated',
  'bot:inventory-drop-one': 'Dropped one item',
  'bot:inventory-drop-stack': 'Dropped the stack',
  'bot:window-click': 'Server menu clicked',
  'bot:window-close': 'Server menu closed',
  'saved-message:create': 'Saved message added',
  'saved-message:update': 'Saved message updated',
  'saved-message:delete': 'Saved message deleted'
}

const savedMessageActions = new Set([
  'saved-message:create',
  'saved-message:update',
  'saved-message:delete'
])

function updateBot(setBots, id, update) {
  setBots(current => current.map(bot => bot.id === id ? update(bot) : bot))
}

function handleSnapshot(message, handlers) {
  handlers.setBots(message.bots)
  handlers.setSelectedId(current => current || message.bots[0]?.id || null)
  handlers.openWindowsRef.current = Object.fromEntries(message.bots.map(bot => [bot.id, Boolean(bot.openWindow)]))
}

function handleBotState(message, handlers) {
  const { bot } = message
  const hadWindow = Boolean(handlers.openWindowsRef.current[bot.id])
  const hasWindow = Boolean(bot.openWindow)
  handlers.openWindowsRef.current[bot.id] = hasWindow
  if (hasWindow && !hadWindow) {
    handlers.setSelectedId(bot.id)
    handlers.setActiveView('menu')
  } else if (!hasWindow && hadWindow) {
    handlers.setActiveView(current => current === 'menu' ? 'status' : current)
  }
  updateBot(handlers.setBots, bot.id, current => ({ ...current, ...bot, logs: current.logs || [] }))
  if (bot.status !== 'online') {
    handlers.completionRequestRef.current = null
    handlers.setSuggestions([])
    handlers.setInventoryActionsOpen(false)
    handlers.setConfirmDropSlot(null)
  }
}

function handleSuccessfulAction(message, action, handlers) {
  if (savedMessageActions.has(action)) {
    handlers.setSavedMessageDraft(null)
    handlers.setSavedMessageToDelete(null)
  }
  if (action === 'bot:profile-create') {
    handlers.setSelectedId(message.result.id)
    handlers.setActiveView('settings')
    handlers.setBotProfileDraft(null)
  } else if (action === 'bot:profile-update') {
    handlers.setBotProfileDraft(null)
  } else if (action === 'bot:profile-delete') {
    handlers.setSelectedId(current => current === message.result.id ? null : current)
    handlers.setActiveView('status')
    handlers.setBotProfileToDelete(null)
  } else if (action === 'bot:auth-start') {
    handlers.setBotToReauthenticate(null)
  }
}

function handleActionResult(message, handlers) {
  const action = handlers.pendingRef.current[message.requestId]
  delete handlers.pendingRef.current[message.requestId]
  handlers.setPending(current => {
    const next = { ...current }
    delete next[message.requestId]
    return next
  })
  const errorMessage = message.error === 'Unsupported action' && action === 'bot:complete'
    ? 'Restart the backend to enable command completion'
    : message.error
  if (action?.startsWith('pin-board:')) {
    handlers.setPinNotice(message.ok ? '' : errorMessage === 'Unsupported action'
      ? 'Restart the backend to enable pin boards' : errorMessage)
    return
  }
  if (action?.startsWith('bot:profile-')) handlers.setBotProfileError(message.ok ? '' : errorMessage)
  const notice = action === 'bot:skin-refresh' && message.ok && !message.result.skinFound
    ? 'No public Minecraft skin was found for this username'
    : actionMessages[action] || 'Bot action complete'
  handlers.setNotice(message.ok ? notice : errorMessage)
  if (message.ok) handleSuccessfulAction(message, action, handlers)
  window.setTimeout(() => handlers.setNotice(''), 3500)
}

function handleCompletion(message, handlers) {
  if (message.requestId === handlers.completionRequestRef.current) {
    handlers.setSuggestions(message.suggestions || [])
  }
}

function handleAuthentication(message, handlers) {
  updateBot(handlers.setBots, message.id, bot => ({ ...bot, authentication: message.authentication }))
}

function handleLog(message, handlers) {
  updateBot(handlers.setBots, message.id, bot => ({ ...bot, logs: [...(bot.logs || []), message.entry].slice(-200) }))
}

function handleDirectMessage(message, handlers) {
  updateBot(handlers.setBots, message.id, bot => ({ ...bot, directMessages: [...(bot.directMessages || []), message.entry] }))
}

export function createDashboardMessageHandler(handlers) {
  const messageHandlers = new Map([
    ['snapshot', handleSnapshot],
    ['saved-messages:snapshot', (message, state) => state.setSavedMessages(message.messages)],
    ['saved-messages:update', (message, state) => state.setSavedMessages(message.messages)],
    ['pin-boards:snapshot', (message, state) => state.setPinBoards(message.boards)],
    ['pin-board:update', (message, state) => state.setPinBoards(current => ({ ...current, [message.id]: message.pins }))],
    ['bot:state', handleBotState],
    ['bot:authentication', handleAuthentication],
    ['bot:log', handleLog],
    ['bot:direct-message', handleDirectMessage],
    ['bot:completion', handleCompletion],
    ['action:result', handleActionResult]
  ])
  return event => {
    const message = JSON.parse(event.data)
    messageHandlers.get(message.type)?.(message, handlers)
  }
}