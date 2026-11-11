import { ArrowUpRight, Send, Terminal } from 'lucide-react'

const quickCommands = ['/survival', '/hub1']

export default function CommandComposer({ bot, command, suggestions, notice, inputRef, isPending, onSubmit, onKeyDown, onChange, onSuggestion, onQuickCommand }) {
  const canSend = bot.status === 'online'
  return (
    <div className="command-area">
      <div className="command-topline">
        <span className="panel-kicker"><Terminal size={13} /> SERVER CHAT / COMMAND</span>
        <span className="command-target">TO {bot.username}</span>
      </div>
      <div className="quick-commands">
        {quickCommands.map(value => (
          <button key={value} type="button" disabled={!canSend || isPending('bot:command')} onClick={() => onQuickCommand(value)}>
            {value}<ArrowUpRight size={12} />
          </button>
        ))}
      </div>
      <div className="command-entry">
        <form className="command-form" autoComplete="off" onSubmit={onSubmit}>
          <input
            ref={inputRef}
            id="command-input"
            name="minecraft-message"
            role="combobox"
            aria-label="Chat message or slash command"
            aria-autocomplete="list"
            aria-controls="command-suggestions"
            aria-describedby="command-history-hint"
            aria-expanded={suggestions.length > 0}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={onKeyDown}
            value={command}
            onChange={event => onChange(event.target.value)}
            placeholder="Message or /command"
            maxLength={256}
            disabled={!canSend}
          />
          <button type="submit" aria-label="Send message or command" title="Send message or command" disabled={!canSend || !command.trim()}>
            <Send size={16} />
          </button>
        </form>
        <span id="command-history-hint" className="command-history-hint">Use ↑ / ↓ for the last 100 sent messages and commands</span>
        {suggestions.length > 0 && (
          <ul id="command-suggestions" className="command-suggestions" role="listbox" aria-label="Command suggestions">
            {suggestions.map((suggestion, index) => (
              <li key={`${suggestion}-${index}`} role="none">
                <button id={`command-suggestion-${index}`} type="button" role="option" onMouseDown={event => event.preventDefault()} onClick={() => onSuggestion(suggestion)}>
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {notice && <div className="notice" role="status">{notice}</div>}
    </div>
  )
}