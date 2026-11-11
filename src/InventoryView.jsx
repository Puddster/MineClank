import InventoryItemIcon from './InventoryItemIcon.jsx'

const equipmentSlots = [
  { slot: 5, label: 'Head' },
  { slot: 6, label: 'Chest' },
  { slot: 7, label: 'Legs' },
  { slot: 8, label: 'Feet' },
  { slot: 45, label: 'Offhand' }
]
const mainInventorySlots = Array.from({ length: 27 }, (_, index) => 9 + index)
const hotbarSlots = Array.from({ length: 9 }, (_, index) => 36 + index)

export default function InventoryView({
  selectedBot,
  inventorySlots,
  inventoryItemCount,
  selectedInventorySlot,
  selectedInventoryItem,
  inventoryActionsOpen,
  setInventoryActionsOpen,
  setSelectedInventorySlot,
  setConfirmDropSlot,
  actionsRef,
  actionsButtonRef,
  isPending,
  sendAction
}) {
  function renderSlot(slot, label) {
    const item = inventorySlots[slot]
    const description = item
      ? `${item.count} x ${item.customName || item.displayName || item.name}`
      : 'Empty'

    return (
      <button
        type="button"
        className={`inventory-slot ${item ? 'filled' : ''} ${selectedInventorySlot === slot ? 'selected' : ''}`}
        key={slot}
        role="gridcell"
        aria-label={`${label}: ${description}`}
        aria-pressed={selectedInventorySlot === slot}
        title={`${label}: ${description}`}
        disabled={selectedBot.status !== 'online' || isPending('bot:inventory-click')}
        onClick={event => {
          setSelectedInventorySlot(slot)
          setInventoryActionsOpen(false)
          sendAction('bot:inventory-click', { slot, mouseButton: 0, mode: event.shiftKey ? 1 : 0 })
        }}
        onContextMenu={event => {
          event.preventDefault()
          setSelectedInventorySlot(slot)
          setInventoryActionsOpen(false)
          sendAction('bot:inventory-click', { slot, mouseButton: 1, mode: event.shiftKey ? 1 : 0 })
        }}
      >
        <span className="inventory-slot-label">{label}</span>
        {item && (
          <>
            <InventoryItemIcon category={item.category} name={item.name} enchanted={item.hasEnchantmentGlint ?? Boolean(item.enchantments?.length)} />
            <span className="inventory-item-name">{item.customName || item.displayName || item.name}</span>
            {item.count > 1 && <span className="inventory-item-count">{item.count}</span>}
          </>
        )}
      </button>
    )
  }

  return (
    <section className="inventory-view detail-view" id="inventory-panel" role="tabpanel" aria-labelledby="inventory-tab">
      <div className="inventory-summary">
        <div>
          <span className="panel-kicker">PLAYER INVENTORY</span>
          <h3>Items</h3>
        </div>
        <span className="inventory-total">{inventoryItemCount} occupied slots</span>
      </div>
      {selectedBot.status !== 'online' || inventorySlots.length === 0 ? (
        <div className="inventory-empty">Inventory data is available while the bot is online.</div>
      ) : (
        <>
          <section className="inventory-section" aria-label="Equipment">
            <div className="inventory-section-heading"><h4>Equipment</h4><span>Armor and offhand</span></div>
            <div className="equipment-grid" role="grid">
              {equipmentSlots.map(({ slot, label }) => renderSlot(slot, label))}
            </div>
          </section>
          <section className="inventory-section" aria-label="Main inventory">
            <div className="inventory-section-heading"><h4>Storage</h4><span>27 slots</span></div>
            <div className="inventory-grid" role="grid">
              {mainInventorySlots.map(slot => renderSlot(slot, String(slot - 8)))}
            </div>
          </section>
          <section className="inventory-section" aria-label="Hotbar">
            <div className="inventory-section-heading"><h4>Hotbar</h4><span>Selected items</span></div>
            <div className="inventory-grid hotbar-grid" role="grid">
              {hotbarSlots.map(slot => renderSlot(slot, String(slot - 35)))}
            </div>
          </section>
          {selectedInventoryItem ? (
            <section className="inventory-item-details" aria-label="Selected item details">
              <div className="inventory-detail-heading">
                <span className="panel-kicker">SLOT {selectedInventorySlot}</span>
                <strong>{selectedInventoryItem.customName || selectedInventoryItem.displayName || selectedInventoryItem.name}</strong>
                <span className="inventory-total">{selectedInventoryItem.count} item(s)</span>
              </div>
              {selectedInventoryItem.enchantments?.length > 0 && (
                <div className="inventory-detail-group">
                  <span className="inventory-detail-label">ENCHANTMENTS</span>
                  <ul>{selectedInventoryItem.enchantments.map((enchantment, index) => (
                    <li key={`${enchantment.name}-${index}`}>{enchantment.name} {enchantment.level}</li>
                  ))}</ul>
                </div>
              )}
              {selectedInventoryItem.lore?.length > 0 && (
                <div className="inventory-detail-group">
                  <span className="inventory-detail-label">LORE</span>
                  <ul>{selectedInventoryItem.lore.map((line, index) => <li key={index}>{line}</li>)}</ul>
                </div>
              )}
              {!selectedInventoryItem.customName && !selectedInventoryItem.enchantments?.length && !selectedInventoryItem.lore?.length && (
                <span className="inventory-select-hint">No custom name, enchantments, or lore</span>
              )}
              <div className="inventory-item-actions">
                <button
                  type="button"
                  className="inventory-action-button"
                  ref={actionsButtonRef}
                  aria-haspopup="menu"
                  aria-expanded={inventoryActionsOpen}
                  disabled={selectedBot.status !== 'online'}
                  onClick={() => setInventoryActionsOpen(open => !open)}
                >Item actions</button>
                {inventoryActionsOpen && (
                  <div className="inventory-context-menu" ref={actionsRef} role="menu" aria-label="Item actions">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={isPending('bot:inventory-drop-one')}
                      onClick={() => {
                        sendAction('bot:inventory-drop-one', { slot: selectedInventorySlot })
                        setInventoryActionsOpen(false)
                      }}
                    >Drop one</button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={isPending('bot:inventory-drop-stack')}
                      onClick={() => {
                        setInventoryActionsOpen(false)
                        setConfirmDropSlot(selectedInventorySlot)
                      }}
                    >Drop stack…</button>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <div className="inventory-select-hint">Select an occupied slot to inspect custom item data.</div>
          )}
        </>
      )}
    </section>
  )
}