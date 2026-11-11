import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { getWebSocketUrl } from './client.js'
import { createDashboardMessageHandler } from './dashboard-socket-messages.js'

export function useDashboardSocket(handlers) {
  const [connection, setConnection] = useState('connecting')
  const socketRef = useRef(null)
  const handleMessage = useEffectEvent(event => createDashboardMessageHandler(handlers)(event))
  const handleClose = useEffectEvent(() => {
    handlers.resetPendingState()
    handlers.setSuggestions([])
    handlers.setInventoryActionsOpen(false)
    handlers.setConfirmDropSlot(null)
    handlers.setPending({})
  })

  useEffect(() => {
    let active = true
    let reconnectTimer
    let initialConnectTimer
    let attempts = 0
    let activeSocket = null

    const connect = () => {
      if (!active) return
      setConnection(attempts ? 'reconnecting' : 'connecting')
      const socket = new WebSocket(getWebSocketUrl())
      activeSocket = socket
      socketRef.current = socket
      socket.addEventListener('open', () => {
        attempts = 0
        setConnection('online')
      })
      socket.addEventListener('message', handleMessage)
      socket.addEventListener('close', () => {
        if (!active) return
        handleClose()
        setConnection('offline')
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
      activeSocket?.close()
    }
  }, [])

  return { connection, socketRef }
}