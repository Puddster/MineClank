import { useRef, useState } from 'react'
import { createRequestId } from './client.js'
import DashboardShell from './DashboardShell.jsx'
import { useDashboardTheme } from './useDashboardTheme.js'
import { useBotProfileController } from './useBotProfileController.js'
import { useCommandDraft } from './useCommandDraft.js'
import { useCommandController } from './useCommandController.js'
import { useSavedMessageController } from './useSavedMessageController.js'
import { formatOnlinePlayerDisplayName } from './online-player-display-name.js'
import { useDashboardSocket } from './useDashboardSocket.js'
import { useInventoryActionMenu } from './useInventoryActionMenu.js'
import './Dashboard.css'

function Dashboard() {
  const { activeTheme, toggleTheme } = useDashboardTheme()
  const [bots, setBots] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [pending, setPending] = useState({})
  const [notice, setNotice] = useState('')
  const [chatColorsEnabled, setChatColorsEnabled] = useState(true)
  const [activeView, setActiveView] = useState('stream')
  const [selectedInventorySlot, setSelectedInventorySlot] = useState(null)
  const [inventoryActionsOpen, setInventoryActionsOpen] = useState(false)
  const [confirmDropSlot, setConfirmDropSlot] = useState(null)
  const pendingRef = useRef({})
  const { inventoryActionsRef, inventoryActionsButtonRef } = useInventoryActionMenu(inventoryActionsOpen, setInventoryActionsOpen)
  const openWindowsRef = useRef({})
  const commandDraft = useCommandDraft()
  const { command, setCommand, suggestions, setSuggestions, commandHistoryRef, historyNavigationRef,
    completionRequestRef, commandInputRef } = commandDraft
  const savedMessageController = useSavedMessageController({
    sendAction,
    setCommand,
    historyNavigationRef,
    commandInputRef
  })
  const {
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
  } = savedMessageController

  const selectedBot = bots.find(bot => bot.id === selectedId) || bots[0] || null
  const profileController = useBotProfileController({ selectedBot, sendAction, setNotice })
  const { connection, socketRef } = useDashboardSocket({
    setBots,
    setSelectedId,
    setActiveView,
    setSavedMessages,
    setSuggestions,
    setInventoryActionsOpen,
    setConfirmDropSlot,
    setPending,
    setNotice,
    setBotProfileError: profileController.setBotProfileError,
    setSavedMessageDraft,
    setSavedMessageToDelete,
    setBotProfileDraft: profileController.setBotProfileDraft,
    setBotProfileToDelete: profileController.setBotProfileToDelete,
    setBotToReauthenticate: profileController.setBotToReauthenticate,
    pendingRef,
    completionRequestRef,
    openWindowsRef,
    resetPendingState: () => {
      pendingRef.current = {}
      completionRequestRef.current = null
    }
  })

  const authenticationPrompt = bots.find(bot => bot.authentication?.status === 'required')
  const onlinePlayers = selectedBot?.onlinePlayers || []
  const nearbyPlayers = onlinePlayers
    .filter(player => !player.isSelf && Number.isFinite(player.distance))
    .slice()
    .sort((left, right) => left.distance - right.distance || left.username.localeCompare(right.username))
  const allOnlinePlayers = onlinePlayers
    .slice()
    .sort((left, right) => (
      formatOnlinePlayerDisplayName(left.displayName).localeCompare(formatOnlinePlayerDisplayName(right.displayName)) ||
      left.username.localeCompare(right.username)
    ))
  const onlineCount = bots.filter(bot => bot.status === 'online').length
  const inventorySlots = selectedBot?.inventory || []
  const inventoryItemCount = inventorySlots.filter(Boolean).length
  const openWindow = selectedBot?.openWindow || null
  const menuItemCount = openWindow?.slots
    ?.slice(0, openWindow.inventoryStart)
    .filter(Boolean).length || 0
  const selectedInventoryItem = selectedInventorySlot === null ? null : inventorySlots[selectedInventorySlot]
  const isPending = action => Object.values(pending).includes(action)

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

  const commandController = useCommandController({
    draft: commandDraft,
    selectedBot,
    connection,
    socketRef,
    sendAction
  })

  return <DashboardShell
    bots={bots}
    onlineCount={onlineCount}
    selectedBot={selectedBot}
    activeTheme={activeTheme}
    toggleTheme={toggleTheme}
    connection={connection}
    profileController={profileController}
    authenticationPrompt={authenticationPrompt}
    panelProps={{
      isPending, sendAction, activeView, setActiveView, openWindow, menuItemCount,
      inventoryItemCount, savedMessages, inventorySlots, selectedInventorySlot,
      selectedInventoryItem, inventoryActionsOpen, confirmDropSlot, setInventoryActionsOpen,
      setSelectedInventorySlot, setConfirmDropSlot, inventoryActionsRef,
      inventoryActionsButtonRef, chatColorsEnabled, setChatColorsEnabled,
      command, suggestions, commandInputRef, commandController,
      savedMessageCategories, filteredSavedMessages, savedMessageSearch,
      setSavedMessageSearch, savedMessageCategory, setSavedMessageCategory,
      onAddSavedMessage: () => setSavedMessageDraft({ id: null, title: '', category: '', message: '' }),
      chooseSavedMessage, setSavedMessageDraft, setSavedMessageToDelete,
      nearbyPlayers, allOnlinePlayers,
      openEditBotProfile: profileController.openEditBotProfile,
      onDeleteBot: profileController.setBotProfileToDelete,
      onReauthenticate: profileController.setBotToReauthenticate,
      notice
    }}
    savedDialogProps={{
      draft: savedMessageDraft, setDraft: setSavedMessageDraft,
      onSave: saveSavedMessage, toFill: savedMessageToFill,
      values: savedMessageValues, setValues: setSavedMessageValues,
      fillError: savedMessageFillError,
      onFill: () => fillSavedMessage(savedMessageToFill, savedMessageValues),
      onCancelFill: () => setSavedMessageToFill(null),
      toDelete: savedMessageToDelete,
      onCancelDelete: () => setSavedMessageToDelete(null),
      onConfirmDelete: confirmDeleteSavedMessage, isPending
    }}
    onSelectBot={bot => {
      setSelectedId(bot.id)
      setSelectedInventorySlot(null)
      setInventoryActionsOpen(false)
      setConfirmDropSlot(null)
    }}
    onConfirmDrop={slot => {
      if (sendAction('bot:inventory-drop-stack', { slot })) {
        setConfirmDropSlot(null)
        setSelectedInventorySlot(null)
      }
    }}
    onCancelDrop={() => setConfirmDropSlot(null)}
  />
}

export default Dashboard