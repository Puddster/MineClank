import { useEffect, useRef } from 'react'

export function useInventoryActionMenu(isOpen, setIsOpen) {
  const menuRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    menuRef.current?.querySelector('[role="menuitem"]')?.focus()

    const handlePointerDown = event => {
      if (!menuRef.current?.contains(event.target)) setIsOpen(false)
    }
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        buttonRef.current?.focus()
        return
      }
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
      const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])]
      if (!items.length) return
      event.preventDefault()
      const currentIndex = items.indexOf(document.activeElement)
      const direction = event.key === 'ArrowDown' ? 1 : -1
      items[(currentIndex + direction + items.length) % items.length].focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, setIsOpen])

  return { inventoryActionsRef: menuRef, inventoryActionsButtonRef: buttonRef }
}