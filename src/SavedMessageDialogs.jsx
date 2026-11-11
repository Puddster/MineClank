import { Save, Trash2 } from 'lucide-react'

function SavedMessageEditor({ draft, setDraft, onSave, isPending }) {
  if (!draft) return null
  const action = draft.id ? 'saved-message:update' : 'saved-message:create'
  return (
    <div className="saved-message-backdrop">
      <form className="saved-message-dialog" onSubmit={onSave}>
        <span className="panel-kicker">{draft.id ? 'EDIT ENTRY' : 'NEW ENTRY'}</span>
        <h3>{draft.id ? 'Edit saved message' : 'Add saved message'}</h3>
        <label>
          <span>Title</span>
          <input autoFocus required maxLength={80} value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} />
        </label>
        <label>
          <span>Category</span>
          <input maxLength={40} placeholder="Optional" value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value }))} />
        </label>
        <label>
          <span>Message or command <small>{draft.message.length}/256</small></span>
          <input type="text" required maxLength={256} value={draft.message} onChange={event => setDraft(current => ({ ...current, message: event.target.value }))} />
        </label>
        <p className="saved-message-hint">Use placeholders like {'{{player}}'}; values are requested when you select this entry.</p>
        <div className="saved-message-form-actions">
          <button type="button" className="inventory-action-button" onClick={() => setDraft(null)}>Cancel</button>
          <button type="submit" className="inventory-action-button saved-message-save" disabled={isPending(action)}>
            <Save size={14} /> Save
          </button>
        </div>
      </form>
    </div>
  )
}

function SavedMessageFiller({ entry, values, setValues, fillError, onFill, onCancel }) {
  if (!entry) return null
  const names = Object.keys(values)
  return (
    <div className="saved-message-backdrop">
      <form className="saved-message-dialog" onSubmit={event => { event.preventDefault(); onFill() }}>
        <span className="panel-kicker">FILL MESSAGE</span>
        <h3>{entry.title}</h3>
        {names.map(name => (
          <label key={name}>
            <span>{name}</span>
            <input autoFocus={name === names[0]} value={values[name]} onChange={event => setValues(current => ({ ...current, [name]: event.target.value }))} />
          </label>
        ))}
        {fillError && <p className="saved-message-error" role="alert">{fillError}</p>}
        <div className="saved-message-form-actions">
          <button type="button" className="inventory-action-button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="inventory-action-button saved-message-save">Fill chat box</button>
        </div>
      </form>
    </div>
  )
}

function SavedMessageDelete({ entry, onCancel, onConfirm, isPending }) {
  if (!entry) return null
  return (
    <div className="saved-message-backdrop">
      <section className="saved-message-dialog" role="alertdialog" aria-modal="true" aria-labelledby="saved-message-delete-title">
        <span className="panel-kicker">DELETE ENTRY</span>
        <h3 id="saved-message-delete-title">Delete {entry.title}?</h3>
        <p>This cannot be undone.</p>
        <div className="saved-message-form-actions">
          <button type="button" className="inventory-action-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="inventory-action-button inventory-drop-stack-button" disabled={isPending('saved-message:delete')} onClick={onConfirm}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </section>
    </div>
  )
}

export default function SavedMessageDialogs(props) {
  return (
    <>
      <SavedMessageEditor draft={props.draft} setDraft={props.setDraft} onSave={props.onSave} isPending={props.isPending} />
      <SavedMessageFiller entry={props.toFill} values={props.values} setValues={props.setValues} fillError={props.fillError} onFill={props.onFill} onCancel={props.onCancelFill} />
      <SavedMessageDelete entry={props.toDelete} onCancel={props.onCancelDelete} onConfirm={props.onConfirmDelete} isPending={props.isPending} />
    </>
  )
}