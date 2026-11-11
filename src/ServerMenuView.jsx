import { X } from 'lucide-react'
import InventoryItemIcon from './InventoryItemIcon.jsx'

function renderMenuSlot(item, slot, { windowId, selectedBot, isPending, sendAction }) {
  const name = item ? item.customName || item.displayName || item.name : 'Empty'
  const description = item
    ? `${item.count} x ${name}${item.lore?.length ? `\n${item.lore.join('\n')}` : ''}`
    : 'Empty menu slot'
  const click = (event, mouseButton) => {
    event.preventDefault()
    sendAction('bot:window-click', {
      windowId,
      slot,
      mouseButton,
      mode: event.shiftKey ? 1 : 0
    })
  }

  return (
    <button
      key={slot}
      type="button"
      className={`inventory-slot menu-slot ${item ? 'filled' : ''}`}
      role="gridcell"
      aria-label={`Menu slot ${slot}: ${item ? `${item.count} x ${name}` : 'empty'}`}
      title={description}
      disabled={selectedBot.status !== 'online' || isPending('bot:window-click')}
      onClick={event => click(event, 0)}
      onContextMenu={event => click(event, 1)}
    >
      <span className="inventory-slot-label">{slot + 1}</span>
      {item && (
        <>
          <InventoryItemIcon category={item.category} name={item.name} enchanted={item.hasEnchantmentGlint ?? Boolean(item.enchantments?.length)} />
          <span className="inventory-item-name">{name}</span>
          {item.count > 1 && <span className="inventory-item-count">{item.count}</span>}
        </>
      )}
    </button>
  )
}

export default function ServerMenuView({ openWindow, selectedBot, menuItemCount, isPending, sendAction }) {
  const slotContext = { windowId: openWindow.id, selectedBot, isPending, sendAction }
  return (
    <section className="menu-view detail-view" id="menu-panel" role="tabpanel" aria-labelledby="menu-tab">
      <div className="inventory-summary">
        <div className="menu-title">
          <span className="panel-kicker">SERVER MENU / {openWindow.type}</span>
          <h3>{openWindow.title}</h3>
        </div>
        <button
          type="button"
          className="inventory-action-button menu-close-button"
          disabled={isPending('bot:window-close')}
          onClick={() => sendAction('bot:window-close', { windowId: openWindow.id })}
        ><X size={14} /> Close menu</button>
      </div>
      <section className="inventory-section" aria-label="Server menu items">
        <div className="inventory-section-heading">
          <h4>Menu items</h4>
          <span>{menuItemCount} items · click to interact</span>
        </div>
        <div className="inventory-grid menu-slot-grid" role="grid" aria-label="Server menu slots">
          {openWindow.slots.slice(0, openWindow.inventoryStart).map((item, slot) => renderMenuSlot(item, slot, slotContext))}
        </div>
      </section>
      {openWindow.slots.length > openWindow.inventoryStart && (
        <section className="inventory-section" aria-label="Player inventory in server menu">
          <div className="inventory-section-heading">
            <h4>Your inventory</h4>
            <span>Click · right-click · shift-click</span>
          </div>
          <div className="inventory-grid menu-slot-grid" role="grid" aria-label="Player inventory slots">
            {openWindow.slots.slice(openWindow.inventoryStart).map((item, index) => {
              const slot = openWindow.inventoryStart + index
              return renderMenuSlot(item, slot, slotContext)
            })}
          </div>
        </section>
      )}
      <p className="menu-help">
        Left-click to pick up or place items. Right-click for half-stack actions; hold Shift while clicking to transfer between inventories.
        {openWindow.selectedItem
          ? ` On cursor: ${openWindow.selectedItem.count} x ${openWindow.selectedItem.customName || openWindow.selectedItem.displayName || openWindow.selectedItem.name}.`
          : ' Cursor: empty.'}
      </p>
    </section>
  )
}