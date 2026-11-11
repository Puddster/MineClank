import { KeyRound, Pencil, Trash2 } from 'lucide-react'

export default function BotSettingsView({
  selectedBot,
  isPending,
  openEditBotProfile,
  onDelete,
  onReauthenticate,
  sendAction
}) {
  return (
    <section className="bot-settings-view detail-view" id="settings-panel" role="tabpanel" aria-labelledby="settings-tab">
      {selectedBot.profile.auth === 'microsoft' && (
        <div className="settings-section">
          <div className="settings-heading">
            <span className="panel-kicker">MICROSOFT ACCOUNT</span>
            <h3>Microsoft sign-in</h3>
            <p>Starting a Microsoft-authenticated bot opens a sign-in prompt here when needed. You can also clear its saved login and start a fresh sign-in now.</p>
            {selectedBot.authentication?.status === 'failed' && (
              <p className="saved-message-error" role="status">{selectedBot.authentication.error || 'Microsoft sign-in failed'}</p>
            )}
          </div>
          <div className="bot-profile-actions">
            <button
              type="button"
              className="inventory-action-button inventory-drop-stack-button"
              disabled={isPending('bot:auth-start')}
              onClick={() => onReauthenticate(selectedBot)}
            >
              <KeyRound size={14} /> Start Microsoft sign-in
            </button>
          </div>
        </div>
      )}
      <div className="settings-section">
        <div className="settings-heading">
          <span className="panel-kicker">BOT PROFILE</span>
          <h3>Connection details</h3>
          <p>Manage the configuration stored for this bot. Updating or deleting an online bot stops it first.</p>
        </div>
        <div className="bot-profile-summary">
          <span><strong>Bot ID</strong>{selectedBot.id}</span>
          <span><strong>Username</strong>{selectedBot.profile.username}</span>
          <span><strong>Server</strong>{selectedBot.profile.host}:{selectedBot.profile.port}</span>
          <span><strong>Authentication</strong>{selectedBot.profile.auth}</span>
        </div>
        <div className="bot-profile-actions">
          <button type="button" className="inventory-action-button" disabled={isPending('bot:profile-update')} onClick={openEditBotProfile}>
            <Pencil size={14} /> Edit profile
          </button>
          <button type="button" className="inventory-action-button inventory-drop-stack-button" disabled={isPending('bot:profile-delete')} onClick={() => onDelete(selectedBot)}>
            <Trash2 size={14} /> Delete bot
          </button>
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-heading">
          <span className="panel-kicker">STARTUP BEHAVIOR</span>
          <h3>Auto start</h3>
          <p>Choose whether this bot connects automatically when MineClank starts. Disabled bots can still be started manually.</p>
        </div>
        <label className="bot-setting-row">
          <span className="bot-setting-description">
            <strong>Auto start</strong>
            <span>{selectedBot.autoStart
              ? 'This bot will be included in the startup queue.'
              : 'This bot will stay stopped until you start it manually.'}</span>
          </span>
          <input
            type="checkbox"
            checked={selectedBot.autoStart !== false}
            disabled={isPending('bot:auto-start')}
            onChange={event => sendAction('bot:auto-start', { enabled: event.target.checked })}
          />
        </label>
        <p className="bot-settings-note">Changing this setting does not stop or start a bot that is already running.</p>
      </div>
    </section>
  )
}