import { useDraggable, useDroppable } from '@dnd-kit/core'
import InventoryItemIcon from './InventoryItemIcon.jsx'

export function InventorySlotContents({ item, label }) {
  return <>
    <span className="inventory-slot-label">{label}</span>
    {item && <>
      <InventoryItemIcon category={item.category} name={item.name} enchanted={item.hasEnchantmentGlint ?? Boolean(item.enchantments?.length)} />
      <span className="inventory-item-name">{item.customName || item.displayName || item.name}</span>
      {item.count > 1 && <span className="inventory-item-count">{item.count}</span>}
    </>}
  </>
}

export default function InventorySlot({ slot, label, item, selected, disabled, menuOpen, onSelect, onMenu }) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: slot, disabled: disabled || !item || menuOpen
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: slot, disabled })
  const description = item ? `${item.count} x ${item.customName || item.displayName || item.name}` : 'Empty'

  function onKeyDown(event) {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault()
      onMenu(event, slot)
      return
    }
    listeners?.onKeyDown?.(event)
  }

  return <button
    {...attributes}
    {...listeners}
    ref={node => { setDragRef(node); setDropRef(node) }}
    type="button"
    data-inventory-slot={slot}
    className={`inventory-slot ${item ? 'filled' : ''} ${selected ? 'selected' : ''} ${isDragging ? 'drag-source' : ''} ${isOver ? 'drag-target' : ''}`}
    role="gridcell"
    aria-label={`${label}: ${description}`}
    aria-disabled={disabled}
    aria-pressed={selected}
    aria-haspopup={item ? 'menu' : undefined}
    title={`${label}: ${description}`}
    disabled={disabled}
    onClick={event => onSelect(event, slot)}
    onContextMenu={event => { event.preventDefault(); onMenu(event, slot) }}
    onKeyDown={onKeyDown}
  ><InventorySlotContents item={item} label={label} /></button>
}