import { ArrowUpRight, Copy, KeyRound, Save, Square, Trash2 } from 'lucide-react'

function BotProfileEditor({ draft, setDraft, onSave, error, connection, isPending }) {
  if (!draft) return null
  const action = draft.mode === 'edit' ? 'bot:profile-update' : 'bot:profile-create'
  const update = field => event => setDraft(current => ({ ...current, [field]: event.target.value }))
  const updateChecked = field => event => setDraft(current => ({ ...current, [field]: event.target.checked }))
  return (
    <div className="saved-message-backdrop">
      <form className="saved-message-dialog bot-profile-dialog" onSubmit={onSave}>
        <span className="panel-kicker">{draft.mode === 'edit' ? 'EDIT BOT PROFILE' : 'NEW BOT PROFILE'}</span>
        <h3>{draft.mode === 'edit' ? `Edit ${draft.username}` : 'Add a bot'}</h3>
        <label>
          <span>Bot ID</span>
          <input autoFocus={draft.mode === 'create'} required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,47}" title="Use 1-48 letters, numbers, underscores, or hyphens; start with a letter or number." disabled={draft.mode === 'edit'} value={draft.id} onChange={update('id')} />
        </label>
        <label>
          <span>Minecraft username</span>
          <input required maxLength={64} value={draft.username} onChange={update('username')} />
        </label>
        <label>
          <span>Server host</span>
          <input required maxLength={253} value={draft.host} onChange={update('host')} />
        </label>
        <div className="bot-profile-fields">
          <label>
            <span>Port</span>
            <input type="number" min="1" max="65535" step="1" required value={draft.port} onChange={update('port')} />
          </label>
          <label>
            <span>Authentication</span>
            <select value={draft.auth} onChange={update('auth')}>
              <option value="microsoft">Microsoft</option>
              <option value="offline">Offline</option>
            </select>
          </label>
        </div>
        <label>
          <span>Version <small>Optional</small></span>
          <input maxLength={40} placeholder="Auto-detect" value={draft.version} onChange={update('version')} />
        </label>
        <label>
          <span>Commands on join <small>One slash command per line, up to 20</small></span>
          <textarea rows="3" value={draft.onJoinText} onChange={update('onJoinText')} />
        </label>
        <label className="bot-profile-checkbox">
          <input type="checkbox" checked={draft.physicsEnabled} onChange={updateChecked('physicsEnabled')} />
          <span>Enable physics simulation</span>
        </label>
        <label className="bot-profile-checkbox">
          <input type="checkbox" checked={draft.autoStart} onChange={updateChecked('autoStart')} />
          <span>Start this bot automatically with MineClank</span>
        </label>
        {error && <p className="saved-message-error" role="alert">{error}</p>}
        <div className="saved-message-form-actions">
          <button type="button" className="inventory-action-button" onClick={() => setDraft(null)}>Cancel</button>
          <button type="submit" className="inventory-action-button saved-message-save" disabled={connection !== 'online' || isPending(action)}>
            <Save size={14} /> {draft.mode === 'edit' ? 'Save changes' : 'Add bot'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ConfirmDialog({ title, children, onCancel, onConfirm, confirmLabel, icon: Icon, disabled }) {
  return (
    <div className="saved-message-backdrop">
      <section className="saved-message-dialog" role="alertdialog" aria-modal="true" aria-labelledby="bot-confirm-title">
        <span className="panel-kicker">{confirmLabel}</span>
        <h3 id="bot-confirm-title">{title}</h3>
        <p>{children}</p>
        <div className="saved-message-form-actions">
          <button type="button" className="inventory-action-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="inventory-action-button inventory-drop-stack-button" disabled={disabled} onClick={onConfirm}>
            <Icon size={14} /> {confirmLabel === 'DELETE BOT' ? 'Delete bot' : 'Continue'}
          </button>
        </div>
      </section>
    </div>
  )
}

function BotAuthenticationPrompt({ bot, onCancel, onCopy }) {
  if (!bot) return null
  return (
    <div className="saved-message-backdrop">
      <section className="saved-message-dialog microsoft-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="microsoft-auth-title">
        <span className="panel-kicker">MICROSOFT SIGN-IN REQUIRED</span>
        <h3 id="microsoft-auth-title">Authorize {bot.username}</h3>
        <p>Open Microsoft’s sign-in page and enter this temporary code. The code is only displayed in the dashboard and is not saved.</p>
        <a className="microsoft-auth-link" href={bot.authentication.verificationUri} target="_blank" rel="noopener noreferrer">
          Open Microsoft sign-in <ArrowUpRight size={14} />
        </a>
        <div className="microsoft-auth-code">{bot.authentication.userCode}</div>
        <p className="microsoft-auth-expiry">Code expires at {new Date(bot.authentication.expiresAt).toLocaleTimeString()}</p>
        <div className="saved-message-form-actions">
          <button type="button" className="inventory-action-button" onClick={() => onCancel(bot.id)}><Square size={14} /> Cancel sign-in</button>
          <button type="button" className="inventory-action-button saved-message-save" onClick={() => onCopy(bot.authentication.userCode)}><Copy size={14} /> Copy code</button>
        </div>
      </section>
    </div>
  )
}

export default function BotProfileDialogs(props) {
  return (
    <>
      <BotProfileEditor draft={props.draft} setDraft={props.setDraft} onSave={props.onSave} error={props.error} connection={props.connection} isPending={props.isPending} />
      {props.toDelete && (
        <ConfirmDialog title={`Delete ${props.toDelete.username}?`} confirmLabel="DELETE BOT" icon={Trash2} disabled={props.isPending('bot:profile-delete')} onCancel={props.onCancelDelete} onConfirm={props.onConfirmDelete}>
          This removes the saved profile and stops the bot if it is online. Its Microsoft authentication cache is retained.
        </ConfirmDialog>
      )}
      {props.toReauthenticate && (
        <ConfirmDialog title={`Start a fresh sign-in for ${props.toReauthenticate.username}?`} confirmLabel="MICROSOFT SIGN-IN" icon={KeyRound} disabled={props.isPending('bot:auth-start')} onCancel={props.onCancelReauthentication} onConfirm={props.onConfirmReauthentication}>
          This stops the bot, clears only its saved Microsoft login cache, and starts it again. A temporary device code will appear here if Microsoft requires authorization.
        </ConfirmDialog>
      )}
      <BotAuthenticationPrompt bot={props.authenticationPrompt} onCancel={props.onCancelSignIn} onCopy={props.onCopyCode} />
    </>
  )
}