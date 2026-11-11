import { useState } from 'react'

const spriteCategories = new Set([
  'blocks-overworld', 'blocks-nether', 'blocks-end', 'blocks-other',
  'materials', 'equipment', 'spawn-eggs', 'food', 'transport'
])

export default function InventoryItemIcon({ category, name, enchanted = false }) {
  const categoryKey = spriteCategories.has(category) ? category : 'materials'
  const [failedItemIcon, setFailedItemIcon] = useState(null)
  const hasSprite = name && !name.includes(':') && failedItemIcon !== name

  return (
    <span className={`inventory-icon-wrap ${enchanted ? 'is-enchanted' : ''}`} aria-hidden="true">
      {hasSprite && (
        <svg className="inventory-category-icon inventory-category-icon-sprite" viewBox="0 0 16 16" aria-hidden="true">
          <use href={`/item-icons/${categoryKey}-sprites.svg#${encodeURIComponent(name)}`} onError={() => setFailedItemIcon(name)} />
        </svg>
      )}
    </span>
  )
}