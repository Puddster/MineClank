function navigateHistoryUp(event, context) {
  const { suggestions, selectedBot, command, commandHistoryRef, historyNavigationRef, setCommand } = context
  if (event.key !== 'ArrowUp' || suggestions.length || !selectedBot?.id) return false
  const history = commandHistoryRef.current[selectedBot.id] || []
  if (!history.length) return false
  event.preventDefault()

  const navigation = historyNavigationRef.current
  const current = navigation?.botId === selectedBot.id
    ? navigation
    : { botId: selectedBot.id, index: history.length, draft: command }
  const index = Math.max(0, current.index - 1)
  historyNavigationRef.current = { ...current, index }
  setCommand(history[index])
  return true
}

function navigateHistoryDown(event, context) {
  const { suggestions, selectedBot, commandHistoryRef, historyNavigationRef, setCommand } = context
  if (event.key !== 'ArrowDown' || suggestions.length) return false
  const navigation = historyNavigationRef.current
  if (navigation?.botId !== selectedBot?.id) return false
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
  return true
}

function applyTabCompletion(event, context) {
  if (event.key !== 'Tab' || !context.command.trimStart().startsWith('/')) return false
  event.preventDefault()
  if (context.suggestions.length) {
    context.applySuggestion(context.suggestions[0])
  } else {
    context.clearCompletionTimer(context.completionTimerRef.current)
    context.requestCompletions(context.command)
  }
  return true
}

export function handleCommandKeyDown(event, context) {
  if (navigateHistoryUp(event, context) || navigateHistoryDown(event, context)) return
  if (event.key === 'Escape') {
    context.setSuggestions([])
    return
  }
  if (applyTabCompletion(event, context)) return
  if (event.key === 'ArrowDown' && context.suggestions.length) {
    event.preventDefault()
    document.getElementById('command-suggestion-0')?.focus()
  }
}