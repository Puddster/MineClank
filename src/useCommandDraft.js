import { useRef, useState } from 'react'

export function useCommandDraft() {
  return {
    ...useCommandState(),
    commandHistoryRef: useRef({}),
    historyNavigationRef: useRef(null),
    completionTimerRef: useRef(null),
    completionRequestRef: useRef(null),
    commandInputRef: useRef(null),
    commandFocusAtEndRef: useRef(false)
  }
}

function useCommandState() {
  const [command, setCommand] = useState('')
  const [suggestions, setSuggestions] = useState([])
  return { command, setCommand, suggestions, setSuggestions }
}