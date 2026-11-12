import { useEffect, useLayoutEffect, useRef } from 'react'

export function useInventoryActionMenu(isOpen, setIsOpen) {
  const menuRef = useRef(null)

  function closeMenu() {
    closeInventoryMenu(menuRef.current, isOpen, setIsOpen)
  }

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return
    const menu = menuRef.current
    const { width, height } = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(8, Math.min(isOpen.x, window.innerWidth - width - 8))}px`
    menu.style.top = `${Math.max(8, Math.min(isOpen.y, window.innerHeight - height - 8))}px`
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const menu = menuRef.current
    menu?.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true })

    const close = () => closeInventoryMenu(menu, isOpen, setIsOpen)

    const handlePointerDown = event => {
      if (!menu?.contains(event.target)) close()
    }
    const handleKeyDown = event => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault()
        close()
        return
      }
      navigateMenu(event, menu)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [isOpen, setIsOpen])

  return { inventoryActionsRef: menuRef, closeMenu }
}

function closeInventoryMenu(menu, context, setIsOpen) {
  if (menu?.contains(document.activeElement)) context.trigger?.focus({ preventScroll: true })
  setIsOpen(false)
}

function navigateMenu(event, menu) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const items = [...(menu?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])]
  if (!items.length) return
  event.preventDefault()
  const index = items.indexOf(document.activeElement)
  const direction = event.key === 'ArrowDown' ? 1 : -1
  const next = { Home: 0, End: items.length - 1 }[event.key] ?? (index + direction + items.length) % items.length
  items[next].focus()
}