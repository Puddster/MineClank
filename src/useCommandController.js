import { useCallback, useEffect, useLayoutEffect } from 'react'
import { createRequestId } from './client.js'
import { handleCommandKeyDown } from './command-input.js'

export function useCommandController({ draft, selectedBot, connection, socketRef, sendAction }) {
  const {
    command, setCommand, suggestions, setSuggestions, commandHistoryRef,
    historyNavigationRef, completionTimerRef, completionRequestRef,
    commandInputRef, commandFocusAtEndRef
  } = draft
  const selectedBotId = selectedBot?.id
  const selectedBotStatus = selectedBot?.status

  const requestCompletions = useCallback(value => {
    const socket = socketRef.current
    if (!selectedBotId || selectedBotStatus !== 'online' || socket?.readyState !== WebSocket.OPEN) return
    const requestId = createRequestId()
    completionRequestRef.current = requestId
    socket.send(JSON.stringify({ type: 'bot:complete', id: selectedBotId, command: value.trimStart(), requestId }))
  }, [selectedBotId, selectedBotStatus, socketRef, completionRequestRef])

  useEffect(() => {
    window.clearTimeout(completionTimerRef.current)
    completionRequestRef.current = null
    const value = command.trimStart()
    if (!value.startsWith('/') || selectedBotStatus !== 'online' || connection !== 'online') return
    completionTimerRef.current = window.setTimeout(() => requestCompletions(value), 250)
    return () => window.clearTimeout(completionTimerRef.current)
  }, [command, connection, requestCompletions, selectedBotStatus, completionTimerRef, completionRequestRef])

  useLayoutEffect(() => {
    if (commandFocusAtEndRef.current) {
      commandFocusAtEndRef.current = false
      const input = commandInputRef.current
      if (input) {
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
      }
    }
  }, [command, commandFocusAtEndRef, commandInputRef])

  function submitMessage(event) {
    event.preventDefault()
    const value = command.trim()
    if (!selectedBot || !value) return
    if (sendAction('bot:command', { command: value })) {
      setSuggestions([])
      setCommand('')
    }
  }

  function fillWhisperCommand(username) {
    const value = `/msg ${username} `
    historyNavigationRef.current = null
    setSuggestions([])
    if (value === command) {
      commandInputRef.current?.focus()
      commandInputRef.current?.setSelectionRange(value.length, value.length)
      return
    }
    commandFocusAtEndRef.current = true
    setCommand(value)
  }

  function fillCommand(value) {
    historyNavigationRef.current = null
    setCommand(value)
    setSuggestions([])
    commandInputRef.current?.focus()
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

  function onCommandKeyDown(event) {
    handleCommandKeyDown(event, {
      suggestions,
      selectedBot,
      command,
      commandHistoryRef,
      historyNavigationRef,
      setCommand,
      setSuggestions,
      applySuggestion,
      completionTimerRef,
      clearCompletionTimer: timer => window.clearTimeout(timer),
      requestCompletions
    })
  }

  function updateCommand(value) {
    historyNavigationRef.current = null
    setCommand(value)
  }

  return { submitMessage, fillWhisperCommand, fillCommand, applySuggestion, onCommandKeyDown, updateCommand }
}