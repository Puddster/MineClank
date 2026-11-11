export function formatOnlinePlayerDisplayName(value) {
  const rawName = String(value || '').trim()
  const hasCrownMarker = /[\uE000-\uF8FF]+$/u.test(rawName)
  const displayName = rawName.replace(/[\uE000-\uF8FF]+$/u, '').trimEnd()
  if (!displayName) return rawName

  let formattedName = displayName
  if (!/^\[[^\]]+\](?:\s|$)/.test(displayName)) {
    const rankAndName = displayName.match(/^(\S+)\s+(.+)$/)
    if (rankAndName) formattedName = `[${rankAndName[1]}] ${rankAndName[2]}`
  }
  return hasCrownMarker ? `${formattedName} ${String.fromCodePoint(0x1f451)}` : formattedName
}