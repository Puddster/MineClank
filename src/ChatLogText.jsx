function renderStyledRange(runs, start, end, keyPrefix) {
  let offset = 0
  return runs.flatMap((run, runIndex) => {
    const runStart = offset
    offset += run.text.length
    const rangeStart = Math.max(start, runStart)
    const rangeEnd = Math.min(end, offset)
    if (rangeStart >= rangeEnd) return []

    return [(
      <span
        key={`${keyPrefix}-${runIndex}`}
        style={{
          color: run.color || undefined,
          fontWeight: run.bold ? 700 : undefined,
          fontStyle: run.italic ? 'italic' : undefined,
          textDecoration: run.underline ? 'underline' : undefined
        }}
      >{run.text.slice(rangeStart - runStart, rangeEnd - runStart)}</span>
    )]
  })
}

function collectInteractions(text, playerLinks = []) {
  const commands = [...text.matchAll(/\/[a-zA-Z ]+/g)].map(match => ({
    start: match.index,
    end: match.index + match[0].length,
    type: 'command',
    command: match[0].trim()
  }))
  const players = playerLinks
    .filter(link => (
      Number.isInteger(link.start) &&
      Number.isInteger(link.end) &&
      link.start >= 0 &&
      link.end > link.start &&
      link.end <= text.length &&
      /^[A-Za-z0-9_]{1,16}$/.test(link.username)
    ))
    .map(link => ({ ...link, type: 'player' }))
  return [...commands, ...players].sort((a, b) => a.start - b.start || a.end - b.end)
}

function renderInteraction(interaction, index, renderRange, onCommand, onPlayer) {
  const isPlayer = interaction.type === 'player'
  const command = isPlayer ? null : interaction.command
  const username = isPlayer ? interaction.username : null
  return (
    <button
      key={`${interaction.type}-${index}-${interaction.start}`}
      type="button"
      className={isPlayer ? 'chat-player' : 'chat-command'}
      title={isPlayer ? `Minecraft username: ${username}` : `Fill command box with ${command}`}
      aria-label={isPlayer ? `Message ${username}` : `Fill command box with ${command}`}
      onClick={() => isPlayer ? onPlayer(username) : onCommand(command)}
    >{renderRange(interaction.start, interaction.end, `command-${index}-${interaction.start}`)}</button>
  )
}

function renderLogSegments(text, interactions, renderRange, onCommand, onPlayer) {
  if (!interactions.length) return renderRange(0, text.length, 'text')
  const nodes = []
  let cursor = 0
  interactions.forEach((interaction, index) => {
    if (interaction.start < cursor) return
    if (interaction.start > cursor) {
      nodes.push(<span key={`text-${cursor}`}>{renderRange(cursor, interaction.start, `text-${cursor}`)}</span>)
    }
    nodes.push(renderInteraction(interaction, index, renderRange, onCommand, onPlayer))
    cursor = interaction.end
  })
  if (cursor < text.length) nodes.push(<span key={`text-${cursor}`}>{renderRange(cursor, text.length, `text-${cursor}`)}</span>)
  return nodes
}

export default function ChatLogText({ entry, chatColorsEnabled, onCommand, onPlayer }) {
  const text = entry.text || ''
  const runsLength = entry.colorRuns?.reduce((length, run) => length + run.text.length, 0)
  const runs = chatColorsEnabled && runsLength === text.length
    ? entry.colorRuns
    : [{ text, color: null, bold: false, italic: false, underline: false }]
  const interactions = collectInteractions(text, entry.playerLinks)
  const renderRange = (start, end, keyPrefix) => renderStyledRange(runs, start, end, keyPrefix)
  return renderLogSegments(text, interactions, renderRange, onCommand, onPlayer)
}