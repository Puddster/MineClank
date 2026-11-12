import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useSensor, useSensors } from '@dnd-kit/core'
import { MoreVertical, PackageMinus, Trash2 } from 'lucide-react'
import InventorySlot, { InventorySlotContents } from './InventorySlot.jsx'
import { inventoryKeyboardCoordinates } from './inventory-drag.js'
import { useInventoryActionMenu } from './useInventoryActionMenu.js'

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
  confirmDropSlot,
  connection,
  isPending,
  sendAction
}) {
  const [activeSlot, setActiveSlot] = useState(null)
  const suppressClickUntil = useRef(0)
  const { inventoryActionsRef: actionsRef, closeMenu } = useInventoryActionMenu(inventoryActionsOpen, setInventoryActionsOpen)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: inventoryKeyboardCoordinates })
  )
  const busy = ['bot:inventory-move', 'bot:inventory-click', 'bot:inventory-drop-one', 'bot:inventory-drop-stack'].some(isPending)
  const disabled = selectedBot.status !== 'online' || connection !== 'online' || Boolean(selectedBot.openWindow) || busy || confirmDropSlot !== null

  useEffect(() => () => setInventoryActionsOpen(false), [setInventoryActionsOpen])

  function openMenu(event, slot) {
    if (disabled || activeSlot !== null || !inventorySlots[slot]) return
    const trigger = event.currentTarget
    const rect = trigger.getBoundingClientRect()
    setSelectedInventorySlot(slot)
    setInventoryActionsOpen({
      slot, id: selectedBot.id, trigger,
      x: event.clientX || rect.left,
      y: event.clientY || rect.bottom
    })
  }

  function selectSlot(event, slot) {
    if (performance.now() < suppressClickUntil.current) return
    setSelectedInventorySlot(slot)
    setInventoryActionsOpen(false)
    if (event.shiftKey) sendAction('bot:inventory-click', { slot, mouseButton: 0, mode: 1 })
  }

  function endDrag({ active, over }) {
    setActiveSlot(null)
    suppressClickUntil.current = performance.now() + 250
    if (disabled || !over || active.id === over.id || !inventorySlots[active.id]) return
    sendAction('bot:inventory-move', { id: selectedBot.id, sourceSlot: active.id, destinationSlot: over.id })
  }

  function renderSlot(slot, label) {
    return <InventorySlot key={slot} slot={slot} label={label} item={inventorySlots[slot]}
      selected={selectedInventorySlot === slot} disabled={disabled} menuOpen={Boolean(inventoryActionsOpen)}
      onSelect={selectSlot} onMenu={openMenu} />
  }

  return (
    <DndContext sensors={sensors} collisionDetection={inventoryCollision}
      onDragStart={({ active }) => { setActiveSlot(active.id); setSelectedInventorySlot(active.id); setInventoryActionsOpen(false) }}
      onDragCancel={() => { setActiveSlot(null); suppressClickUntil.current = performance.now() + 250 }}
      onDragEnd={endDrag}>
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
            <InventoryItemDetails item={selectedInventoryItem} slot={selectedInventorySlot}
              disabled={disabled} menuOpen={Boolean(inventoryActionsOpen)} onMenu={openMenu} />
          ) : (
            <div className="inventory-select-hint">Select an occupied slot to inspect custom item data.</div>
          )}
        </>
      )}
      {inventoryActionsOpen && createPortal(
        <div className="inventory-context-menu" ref={actionsRef} role="menu" aria-label="Item actions"
          style={{ left: inventoryActionsOpen.x, top: inventoryActionsOpen.y }}>
          <button type="button" role="menuitem" disabled={disabled} onClick={() => {
            sendAction('bot:inventory-drop-one', { id: inventoryActionsOpen.id, slot: inventoryActionsOpen.slot })
            closeMenu()
          }}><PackageMinus size={14} aria-hidden="true" />Drop 1</button>
          <button type="button" role="menuitem" disabled={disabled} onClick={() => {
            setConfirmDropSlot(inventoryActionsOpen.slot)
            closeMenu()
          }}><Trash2 size={14} aria-hidden="true" />Drop All</button>
        </div>, document.body
      )}
    </section>
    {createPortal(<DragOverlay dropAnimation={null}>
      {activeSlot !== null && <div className="inventory-slot filled inventory-drag-preview">
        <InventorySlotContents item={inventorySlots[activeSlot]} label="" />
      </div>}
    </DragOverlay>, document.body)}
    </DndContext>
  )
}

function inventoryCollision(args) {
  return args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args)
}

function InventoryItemDetails({ item: selectedInventoryItem, slot: selectedInventorySlot, disabled, menuOpen, onMenu }) {
  return <section className="inventory-item-details" aria-label="Selected item details">
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
                  className="inventory-action-button inventory-menu-trigger"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Item actions"
                  title="Item actions"
                  disabled={disabled}
                  onClick={event => onMenu(event, selectedInventorySlot)}
                ><MoreVertical size={16} aria-hidden="true" /></button>
              </div>
            </section>
}