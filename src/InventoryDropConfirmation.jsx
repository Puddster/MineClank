import { useLayoutEffect, useRef } from 'react'

export default function InventoryDropConfirmation({ slot, inventorySlots, isPending, onCancel, onComplete }) {
  const cancelRef = useRef(null)
  useLayoutEffect(() => {
    if (slot === null) return
    const previous = document.querySelector(`[data-inventory-slot="${slot}"]`)
    cancelRef.current?.focus()
    return () => queueMicrotask(() => previous?.focus({ preventScroll: true }))
  }, [slot])

  if (slot === null) return null
  const item = inventorySlots[slot]
  const itemName = item && (item.customName || item.displayName || item.name)
  return (
    <div className="inventory-confirm-backdrop">
      <section className="inventory-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="drop-stack-title"
        onKeyDown={event => handleConfirmationKey(event, onCancel)}>
        <span className="panel-kicker">CONFIRM DROP</span>
        <h3 id="drop-stack-title">Drop entire stack?</h3>
        <p>{item ? `Drop all ${item.count} x ${itemName}?` : 'That item is no longer in the selected slot.'}</p>
        <div className="inventory-confirm-actions">
          <button type="button" className="inventory-action-button" ref={cancelRef} onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="inventory-action-button inventory-drop-stack-button"
            disabled={!item || isPending('bot:inventory-drop-stack')}
            onClick={onComplete}
          >Drop All</button>
        </div>
      </section>
    </div>
  )
}

function handleConfirmationKey(event, onCancel) {
  if (event.key === 'Escape') {
    event.preventDefault()
    onCancel()
  }
  if (event.key !== 'Tab') return
  event.preventDefault()
  const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
  const index = buttons.indexOf(document.activeElement)
  const direction = event.shiftKey ? -1 : 1
  buttons[(index + direction + buttons.length) % buttons.length]?.focus()
}