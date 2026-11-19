import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import InventoryItemIcon from './InventoryItemIcon.jsx'

export default function InventoryContainerContents({ items }) {
  return <ul className="inventory-container-contents">
    {items.map((item, index) => (
      <li key={`${item.slot}-${index}`}>
        <InventoryItemIcon category={item.category} name={item.name} />
        <span className="inventory-container-item-name">{item.customName || item.displayName || item.name}</span>
        {item.count > 1 && <span className="inventory-container-item-count">x{item.count}</span>}
      </li>
    ))}
  </ul>
}

export function ShulkerTooltip({ id, anchor, item, setDismissed, showLore = false }) {
  const tooltipRef = useRef(null)

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current
    const position = () => positionTooltip(tooltip, anchor)
    const dismiss = event => {
      if (event.key === 'Escape') setDismissed(true)
    }

    position()
    const observer = new ResizeObserver(position)
    observer.observe(tooltip)
    observer.observe(anchor)
    window.addEventListener('keydown', dismiss)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('keydown', dismiss)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [anchor, setDismissed])

  return createPortal(
    <div ref={tooltipRef} className="inventory-container-tooltip inventory-detail-group" id={id} role="tooltip">
      <strong>{item.customName || item.displayName || item.name}</strong>
      {item.containerItems?.length
        ? <InventoryContainerContents items={item.containerItems} />
        : <span className="inventory-select-hint">No contents to preview</span>}
      {showLore && item.lore?.length > 0 && (
        <ul aria-label="Lore">{item.lore.map((line, index) => <li key={index}>{line}</li>)}</ul>
      )}
    </div>,
    document.body
  )
}

function positionTooltip(tooltip, anchor) {
  const gap = 8
  const rect = anchor.getBoundingClientRect()
  const { width, height } = tooltip.getBoundingClientRect()
  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = document.documentElement.clientHeight
  const belowFits = rect.bottom + gap + height <= viewportHeight - gap
  const y = belowFits ? rect.bottom + gap : rect.top - gap - height

  tooltip.style.left = `${Math.max(gap, Math.min(rect.left, viewportWidth - width - gap))}px`
  tooltip.style.top = `${Math.max(gap, Math.min(y, viewportHeight - height - gap))}px`
}
