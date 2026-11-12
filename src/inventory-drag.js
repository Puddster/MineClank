export function inventoryKeyboardCoordinates(event, { currentCoordinates, context }) {
  const directions = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }
  const direction = directions[event.code]
  const current = context.collisionRect
  if (!direction || !current) return
  event.preventDefault()
  const candidates = context.droppableContainers.getEnabled()
    .map(container => container.rect.current)
    .filter(Boolean)
    .map(rect => ({ x: rect.left - current.left, y: rect.top - current.top }))
    .filter(delta => delta.x * direction[0] + delta.y * direction[1] > 1)
    .sort((left, right) => keyboardDistance(left, direction) - keyboardDistance(right, direction))
  const target = candidates[0]
  if (target) return { x: currentCoordinates.x + target.x, y: currentCoordinates.y + target.y }
}

function keyboardDistance(delta, [horizontal, vertical]) {
  return Math.abs(delta.x * horizontal + delta.y * vertical) + 4 * Math.abs(delta.x * vertical + delta.y * horizontal)
}