import { Activity, Bot } from 'lucide-react'
import BotLifecycleActions from './BotLifecycleActions.jsx'
import BotMetrics from './BotMetrics.jsx'
import BotProfileDialogs from './BotProfileDialogs.jsx'
import BotViews from './BotViews.jsx'
import CommandComposer from './CommandComposer.jsx'
import ConnectionStatus from './ConnectionStatus.jsx'
import FleetPanel from './FleetPanel.jsx'
import InventoryDropConfirmation from './InventoryDropConfirmation.jsx'
import SavedMessageDialogs from './SavedMessageDialogs.jsx'
import ThemeToggle from './ThemeToggle.jsx'

export default function DashboardShell({
  bots,
  onlineCount,
  selectedBot,
  activeTheme,
  toggleTheme,
  connection,
  profileController,
  authenticationPrompt,
  panelProps,
  savedDialogProps,
  onSelectBot,
  onConfirmDrop,
  onCancelDrop
}) {
  const { inventorySlots, confirmDropSlot, isPending, sendAction } = panelProps
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#fleet" aria-label="MineClank home">
          <span className="brand-mark"><Bot size={19} strokeWidth={2.2} /></span>
          <span>MINECLANK<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-meta">
          <span className="environment"><span className="environment-dot" /> CONTROL PLANE</span>
          <ConnectionStatus connection={connection} />
        </div>
      </header>
      <section className="page-heading" id="fleet">
        <div><div className="eyebrow"><Activity size={14} /> FLEET OPERATIONS</div><h1>Bot control</h1></div>
        <div className="fleet-totals" aria-label={`${onlineCount} of ${bots.length} bots online`}>
          <span className="total-online">{String(onlineCount).padStart(2, '0')}</span>
          <span className="total-divider">/</span>
          <span className="total-all">{String(bots.length).padStart(2, '0')}</span>
          <span className="total-caption">ONLINE</span>
        </div>
      </section>
      <section className="control-grid">
        <FleetPanel bots={bots} selectedBotId={selectedBot?.id} onAdd={profileController.openNewBotProfile} onSelect={onSelectBot} />
        <section className={`detail-panel panel ${selectedBot ? '' : 'detail-empty'}`} aria-label="Selected bot details">
          {selectedBot ? (
            <>
              <div className="selected-heading">
                <div className="selected-identity">
                  <span className={`selected-avatar status-${selectedBot.status}`}><Bot size={22} /></span>
                  <div><span className="panel-kicker">BOT PROFILE / {selectedBot.id}</span><h2>{selectedBot.username}</h2></div>
                </div>
                <BotLifecycleActions bot={selectedBot} isPending={isPending} sendAction={sendAction} />
              </div>
              <BotMetrics bot={selectedBot} />
              {selectedBot.lastError && <div className="error-banner">{selectedBot.lastError}</div>}
              <BotViews bot={selectedBot} {...panelProps} />
              <InventoryDropConfirmation
                slot={confirmDropSlot}
                inventorySlots={inventorySlots}
                isPending={isPending}
                onCancel={onCancelDrop}
                onComplete={() => onConfirmDrop(confirmDropSlot)}
              />
              <SavedMessageDialogs {...savedDialogProps} />
              {panelProps.activeView !== 'direct-messages' && <CommandComposer
                bot={selectedBot}
                command={panelProps.command}
                suggestions={panelProps.suggestions}
                notice={panelProps.notice}
                inputRef={panelProps.commandInputRef}
                isPending={isPending}
                onSubmit={panelProps.commandController.submitMessage}
                onKeyDown={panelProps.commandController.onCommandKeyDown}
                onChange={panelProps.commandController.updateCommand}
                onSuggestion={panelProps.commandController.applySuggestion}
                onQuickCommand={value => sendAction('bot:command', { command: value })}
              />}
            </>
          ) : (
            <div className="no-selection">
              <div className="no-selection-mark"><Bot size={28} /></div>
              <span className="panel-kicker">FLEET EMPTY</span>
              <h2>Nothing on the wire.</h2>
              <p>No bot profiles configured.</p>
            </div>
          )}
        </section>
      </section>
      <BotProfileDialogs
        draft={profileController.botProfileDraft}
        setDraft={profileController.setBotProfileDraft}
        onSave={profileController.saveBotProfile}
        error={profileController.botProfileError}
        connection={connection}
        isPending={isPending}
        toDelete={profileController.botProfileToDelete}
        onCancelDelete={() => profileController.setBotProfileToDelete(null)}
        onConfirmDelete={profileController.confirmDeleteBotProfile}
        toReauthenticate={profileController.botToReauthenticate}
        onCancelReauthentication={() => profileController.setBotToReauthenticate(null)}
        onConfirmReauthentication={profileController.confirmMicrosoftReauthentication}
        authenticationPrompt={authenticationPrompt}
        onCancelSignIn={id => sendAction('bot:stop', { id })}
        onCopyCode={profileController.copyMicrosoftCode}
      />
      <footer className="app-footer">
        <span><span className="footer-mark" /> MINECLANK CONTROL</span>
        <span>{bots.length} CONFIGURED <span className="footer-separator">/</span> {onlineCount} ONLINE</span>
        <ThemeToggle activeTheme={activeTheme} onToggle={toggleTheme} />
      </footer>
    </main>
  )
}