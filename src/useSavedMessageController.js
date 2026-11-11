import { useState } from 'react'

const placeholderPattern = /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g

function savedMessageVariables(message) {
  return [...new Set([...message.matchAll(placeholderPattern)].map(match => match[1]))]
}

export function useSavedMessageController({ sendAction, setCommand, historyNavigationRef, commandInputRef }) {
  const [savedMessages, setSavedMessages] = useState([])
  const [savedMessageSearch, setSavedMessageSearch] = useState('')
  const [savedMessageCategory, setSavedMessageCategory] = useState('all')
  const [savedMessageDraft, setSavedMessageDraft] = useState(null)
  const [savedMessageToDelete, setSavedMessageToDelete] = useState(null)
  const [savedMessageToFill, setSavedMessageToFill] = useState(null)
  const [savedMessageValues, setSavedMessageValues] = useState({})
  const [savedMessageFillError, setSavedMessageFillError] = useState('')

  const savedMessageCategories = [...new Set(savedMessages.map(entry => entry.category).filter(Boolean))]
  const search = savedMessageSearch.trim().toLocaleLowerCase()
  const filteredSavedMessages = savedMessages.filter(entry => {
    const matchesCategory = savedMessageCategory === 'all' || entry.category === savedMessageCategory
    const matchesSearch = !search ||
      `${entry.title} ${entry.category} ${entry.message}`.toLocaleLowerCase().includes(search)
    return matchesCategory && matchesSearch
  })

  function fillSavedMessage(entry, values = {}) {
    const message = entry.message.replace(placeholderPattern, (_match, name) => values[name] ?? '')
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
    if (savedMessageToDelete) sendAction('saved-message:delete', { messageId: savedMessageToDelete.id })
  }

  return {
    savedMessages,
    setSavedMessages,
    savedMessageSearch,
    setSavedMessageSearch,
    savedMessageCategory,
    setSavedMessageCategory,
    savedMessageDraft,
    setSavedMessageDraft,
    savedMessageToDelete,
    setSavedMessageToDelete,
    savedMessageToFill,
    setSavedMessageToFill,
    savedMessageValues,
    setSavedMessageValues,
    savedMessageFillError,
    savedMessageCategories,
    filteredSavedMessages,
    fillSavedMessage,
    chooseSavedMessage,
    saveSavedMessage,
    confirmDeleteSavedMessage
  }
}