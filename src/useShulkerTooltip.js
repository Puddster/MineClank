import { useId, useState } from 'react'

export function useShulkerTooltip(inventorySlots, blocked) {
  const id = useId()
  const [hovered, setHovered] = useState(null)
  const [focused, setFocused] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const target = hovered || focused
  const item = inventorySlots[target?.slot]
  const open = isShulkerBox(item) && !blocked && !dismissed

  function slotProps(slot) {
    const isShulker = isShulkerBox(inventorySlots[slot])
    return {
      showNativeTitle: !isShulker || blocked,
      'aria-describedby': open && target.slot === slot ? id : undefined,
      onPointerEnter(event) {
        if (!isShulker || event.pointerType === 'touch') return
        setDismissed(false)
        setHovered({ slot, anchor: event.currentTarget })
      },
      onPointerLeave() { setHovered(current => current?.slot === slot ? null : current) },
      onFocus(event) {
        if (!isShulker || !event.currentTarget.matches(':focus-visible')) return
        setDismissed(false)
        setFocused({ slot, anchor: event.currentTarget })
      },
      onBlur() { setFocused(current => current?.slot === slot ? null : current) }
    }
  }

  return {
    slotProps,
    tooltipProps: open ? { id, anchor: target.anchor, item, setDismissed } : null
  }
}

function isShulkerBox(item) {
  return /^(?:minecraft:)?(?:[a-z_]+_)?shulker_box$/.test(item?.name)
}
