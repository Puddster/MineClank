export default function InventoryDropConfirmation({ slot, inventorySlots, isPending, sendAction, onCancel, onComplete }) {
  if (slot === null) return null
  const item = inventorySlots[slot]
  const itemName = item && (item.customName || item.displayName || item.name)
  return (
    <div className="inventory-confirm-backdrop">
      <section className="inventory-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="drop-stack-title">
        <span className="panel-kicker">CONFIRM DROP</span>
        <h3 id="drop-stack-title">Drop entire stack?</h3>
        <p>{item ? `Drop all ${item.count} x ${itemName}?` : 'That item is no longer in the selected slot.'}</p>
        <div className="inventory-confirm-actions">
          <button type="button" className="inventory-action-button" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="inventory-action-button inventory-drop-stack-button"
            disabled={!item || isPending('bot:inventory-drop-stack')}
            onClick={() => {
              if (sendAction('bot:inventory-drop-stack', { slot })) onComplete()
            }}
          >Drop stack</button>
        </div>
      </section>
    </div>
  )
}