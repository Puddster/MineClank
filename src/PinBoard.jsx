import { DndContext, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { ArrowLeft, ArrowRight, BookOpen, GripVertical, Package, Pin, PinOff } from 'lucide-react'
import { PlayerStat } from './BotPlayerStats.jsx'
import { playerStats } from './player-stats.js'
import InventoryItemIcon from './InventoryItemIcon.jsx'

function pinId(pin) {
  return JSON.stringify([pin.type, pin.ref])
}

function boardCollision(args) {
  const targets = { ...args, droppableContainers: args.droppableContainers.filter(container => container.id !== args.active.id) }
  return args.pointerCoordinates ? pointerWithin(targets) : rectIntersection(targets)
}

function slotLabel(ref) {
  const slot = Number(ref)
  const equipment = { 5: 'Head', 6: 'Chest', 7: 'Legs', 8: 'Feet', 45: 'Offhand' }
  return equipment[slot] || (slot >= 36 ? `Hotbar ${slot - 35}` : `Storage ${slot - 8}`)
}

function PinContents({ pin, bot, inventorySlots, savedMessages }) {
  if (pin.type === 'status') {
    const stat = playerStats(bot).find(item => item.id === pin.ref)
    return stat ? <PlayerStat {...stat} /> : null
  }
  if (pin.type === 'inventory') {
    const item = bot.status === 'online' ? inventorySlots[Number(pin.ref)] : null
    return <span className="pinboard-item-content">
      {item ? <InventoryItemIcon category={item.category} name={item.name} enchanted={item.hasEnchantmentGlint ?? Boolean(item.enchantments?.length)} /> : <Package size={18} />}
      <span className="pinboard-item-text"><small>{slotLabel(pin.ref)}</small><strong>{bot.status !== 'online' ? 'Unavailable' : item ? `${item.customName || item.displayName || item.name}${item.count > 1 ? ` ×${item.count}` : ''}` : 'Empty'}</strong></span>
    </span>
  }
  const message = savedMessages.find(entry => entry.id === pin.ref)
  return <span className="pinboard-item-content"><BookOpen size={18} /><span className="pinboard-item-text"><small>{message?.category || 'SAVED MESSAGE'}</small><strong>{message?.title || 'Unavailable'}</strong></span></span>
}

function BoardItem({ pin, index, pinBoard, bot, inventorySlots, savedMessages, onActivate }) {
  const id = pinId(pin)
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id, disabled: !pinBoard.editing || pinBoard.disabled })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id, disabled: !pinBoard.editing || pinBoard.disabled })
  const content = <PinContents pin={pin} bot={bot} inventorySlots={inventorySlots} savedMessages={savedMessages} />
  const unavailable = pin.type === 'inventory' && (bot.status !== 'online' || pinBoard.inventoryDisabled)
  const missingMessage = pin.type === 'message' && !savedMessages.some(message => message.id === pin.ref)
  const interactive = pinBoard.editing || pin.type !== 'status'
  return <div ref={node => { setDragRef(node); setDropRef(node) }}
    className={`pinboard-item ${isDragging ? 'is-dragging' : ''} ${isOver && !isDragging ? 'is-over' : ''}`}
    style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 2 } : undefined}>
    {interactive ? <button type="button" className="pinboard-content" disabled={pinBoard.editing ? pinBoard.disabled : unavailable || missingMessage}
      title={pinBoard.editing ? 'Remove pin' : pin.type === 'inventory' ? 'Open inventory slot' : 'Use saved message'}
      onClick={() => pinBoard.editing ? pinBoard.toggle(pin.type, pin.ref) : onActivate(pin)}>{content}</button>
      : <div className="pinboard-content">{content}</div>}
    {pinBoard.editing && <div className="pinboard-order">
      <button type="button" title="Move left" aria-label="Move pin left" disabled={pinBoard.disabled || index === 0}
        onClick={() => pinBoard.move(pin, pinBoard.pins[index - 1], false)}><ArrowLeft size={13} /></button>
      <button type="button" title="Drag to reorder" aria-label="Drag to reorder pin" disabled={pinBoard.disabled}
        {...attributes} {...listeners}><GripVertical size={14} /></button>
      <button type="button" title="Move right" aria-label="Move pin right" disabled={pinBoard.disabled || index === pinBoard.pins.length - 1}
        onClick={() => pinBoard.move(pin, pinBoard.pins[index + 1], true)}><ArrowRight size={13} /></button>
    </div>}
  </div>
}

export default function PinBoard({ bot, pinBoard, inventorySlots, savedMessages, onActivate }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 5 } })
  )
  function endDrag({ active, over }) {
    if (!over || active.id === over.id || pinBoard.disabled) return
    const sourceIndex = pinBoard.pins.findIndex(pin => pinId(pin) === active.id)
    const targetIndex = pinBoard.pins.findIndex(pin => pinId(pin) === over.id)
    if (sourceIndex < 0 || targetIndex < 0) return
    pinBoard.move(pinBoard.pins[sourceIndex], pinBoard.pins[targetIndex], sourceIndex < targetIndex)
  }
  return <section className="pinboard" aria-label="Pin board">
    <div className="pinboard-heading"><span className="panel-kicker"><Pin size={13} /> PIN BOARD</span>
      <button type="button" className={`pinboard-edit ${pinBoard.editing ? 'selected' : ''}`}
        title={pinBoard.editing ? 'Finish editing pins' : 'Edit pins'} aria-label={pinBoard.editing ? 'Finish editing pins' : 'Edit pins'}
        aria-pressed={pinBoard.editing} disabled={!pinBoard.editing && pinBoard.disabled}
        onClick={() => pinBoard.setEditing(!pinBoard.editing)}>{pinBoard.editing ? <PinOff size={15} /> : <Pin size={15} />}</button>
    </div>
    {pinBoard.pins.length ? <DndContext sensors={sensors} collisionDetection={boardCollision} onDragEnd={endDrag}>
      <div className="pinboard-grid">{pinBoard.pins.map((pin, index) => <BoardItem key={pinId(pin)} pin={pin} index={index} pinBoard={pinBoard}
        bot={bot} inventorySlots={inventorySlots} savedMessages={savedMessages} onActivate={onActivate} />)}</div>
    </DndContext> : <div className="pinboard-empty">No pins yet</div>}
    {pinBoard.notice && <div className="pinboard-notice" role="status">{pinBoard.notice}</div>}
  </section>
}