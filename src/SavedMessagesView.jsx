import { BookOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react'

export default function SavedMessagesView({
  categories,
  entries,
  filteredEntries,
  search,
  category,
  onSearchChange,
  onCategoryChange,
  onAdd,
  onChoose,
  onEdit,
  onDelete
}) {
  return (
    <section className="saved-messages-view detail-view" id="saved-messages-panel" role="tabpanel" aria-labelledby="saved-messages-tab">
      <div className="saved-messages-heading">
        <div>
          <span className="panel-kicker">REUSABLE CHAT / COMMANDS</span>
          <h3>Saved Messages</h3>
        </div>
        <button type="button" className="inventory-action-button saved-add-button" onClick={onAdd}>
          <Plus size={14} /> Add message
        </button>
      </div>
      <div className="saved-message-filters">
        <label className="saved-message-search">
          <Search size={14} />
          <input
            type="search"
            aria-label="Search saved messages"
            placeholder="Search title, category, or text"
            value={search}
            onChange={event => onSearchChange(event.target.value)}
          />
        </label>
        <select aria-label="Filter by category" value={category} onChange={event => onCategoryChange(event.target.value)}>
          <option value="all">All categories</option>
          {categories.map(value => <option key={value} value={value}>{value}</option>)}
          {entries.some(entry => !entry.category) && <option value="">Uncategorized</option>}
        </select>
      </div>
      {filteredEntries.length ? (
        <div className="saved-message-list">
          {filteredEntries.map(entry => (
            <article className="saved-message-card" key={entry.id}>
              <button type="button" className="saved-message-insert" title="Fill the chat box without sending" onClick={() => onChoose(entry)}>
                <span className="saved-message-card-heading">
                  <strong>{entry.title}</strong>
                  <span>{entry.category || 'Uncategorized'}</span>
                </span>
                <span className="saved-message-preview">{entry.message}</span>
              </button>
              <div className="saved-message-card-actions">
                <button type="button" aria-label={`Edit ${entry.title}`} title="Edit" onClick={() => onEdit(entry)}><Pencil size={14} /></button>
                <button type="button" aria-label={`Delete ${entry.title}`} title="Delete" onClick={() => onDelete(entry)}><Trash2 size={14} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="saved-messages-empty">
          <BookOpen size={20} />
          <span>{entries.length ? 'No saved messages match this filter.' : 'No saved messages yet. Add one to get started.'}</span>
        </div>
      )}
      <p className="saved-message-hint">Select a message to fill the chat box. It will not be sent until you press Send.</p>
    </section>
  )
}