import { BookOpen, Package, Palette, PanelsTopLeft, Radio, Settings, Users } from 'lucide-react'
import BotSettingsView from './BotSettingsView.jsx'
import InventoryView from './InventoryView.jsx'
import LiveStreamView from './LiveStreamView.jsx'
import OnlinePlayersView from './OnlinePlayersView.jsx'
import SavedMessagesView from './SavedMessagesView.jsx'
import ServerMenuView from './ServerMenuView.jsx'

function ViewTabs({ activeView, setActiveView, bot, openWindow, inventoryItemCount, savedMessageCount, menuItemCount, chatColorsEnabled, setChatColorsEnabled }) {
  const tabs = [
    { id: 'stream', panel: 'stream-panel', icon: Radio, label: 'Live stream' },
    { id: 'inventory', panel: 'inventory-panel', icon: Package, label: 'Inventory', count: inventoryItemCount },
    { id: 'saved', panel: 'saved-messages-panel', icon: BookOpen, label: 'Saved Messages', count: savedMessageCount },
    { id: 'players', panel: 'online-players-panel', icon: Users, label: 'Online Players', count: bot.onlinePlayers?.length || 0 },
    { id: 'settings', panel: 'settings-panel', icon: Settings, label: 'Settings' }
  ]
  if (openWindow) tabs.push({ id: 'menu', panel: 'menu-panel', icon: PanelsTopLeft, label: 'Server Menu', count: menuItemCount })

  return (
    <div className="detail-view-header">
      <div className="detail-tabs" role="tablist" aria-label="Bot views">
        {tabs.map(({ id, panel, icon: Icon, label, count }) => (
          <button
            key={id}
            id={`${id === 'saved' ? 'saved-messages' : id}-tab`}
            type="button"
            role="tab"
            aria-selected={activeView === id}
            aria-controls={panel}
            className={`detail-tab ${activeView === id ? 'selected' : ''}`}
            onClick={() => setActiveView(id)}
          >
            <Icon size={15} /> {label}
            {count !== undefined && <span className="tab-count">{count}</span>}
          </button>
        ))}
      </div>
      {activeView === 'stream' && (
        <div className="stream-controls">
          <button
            type="button"
            className="color-toggle"
            title={chatColorsEnabled ? 'Disable chat colors' : 'Enable chat colors'}
            aria-label={chatColorsEnabled ? 'Disable chat colors' : 'Enable chat colors'}
            aria-pressed={chatColorsEnabled}
            onClick={() => setChatColorsEnabled(enabled => !enabled)}
          ><Palette size={14} /></button>
          <span className="stream-indicator"><span className="status-dot status-online" /> LIVE</span>
        </div>
      )}
    </div>
  )
}

function ActiveView(props) {
  const { activeView, bot, openWindow } = props
  if (activeView === 'stream') {
    return <LiveStreamView bot={bot} chatColorsEnabled={props.chatColorsEnabled} onCommand={props.onCommand} onPlayer={props.onPlayer} />
  }
  if (activeView === 'settings') {
    return <BotSettingsView selectedBot={bot} isPending={props.isPending} openEditBotProfile={props.openEditBotProfile} onDelete={props.onDeleteBot} onReauthenticate={props.onReauthenticate} sendAction={props.sendAction} />
  }
  if (activeView === 'inventory') {
    return <InventoryView
      selectedBot={bot}
      inventorySlots={props.inventorySlots}
      inventoryItemCount={props.inventoryItemCount}
      selectedInventorySlot={props.selectedInventorySlot}
      selectedInventoryItem={props.selectedInventoryItem}
      inventoryActionsOpen={props.inventoryActionsOpen}
      setInventoryActionsOpen={props.setInventoryActionsOpen}
      setSelectedInventorySlot={props.setSelectedInventorySlot}
      setConfirmDropSlot={props.setConfirmDropSlot}
      actionsRef={props.actionsRef}
      actionsButtonRef={props.actionsButtonRef}
      isPending={props.isPending}
      sendAction={props.sendAction}
    />
  }
  if (activeView === 'saved') {
    return <SavedMessagesView
      categories={props.savedMessageCategories}
      entries={props.savedMessages}
      filteredEntries={props.filteredSavedMessages}
      search={props.savedMessageSearch}
      category={props.savedMessageCategory}
      onSearchChange={props.setSavedMessageSearch}
      onCategoryChange={props.setSavedMessageCategory}
      onAdd={props.onAddSavedMessage}
      onChoose={props.onChooseSavedMessage}
      onEdit={props.onEditSavedMessage}
      onDelete={props.onDeleteSavedMessage}
    />
  }
  if (activeView === 'players') {
    return <OnlinePlayersView bot={bot} onlinePlayers={bot.onlinePlayers || []} nearbyPlayers={props.nearbyPlayers} allPlayers={props.allOnlinePlayers} onMessage={props.onPlayer} />
  }
  return openWindow
    ? <ServerMenuView openWindow={openWindow} selectedBot={bot} menuItemCount={props.menuItemCount} isPending={props.isPending} sendAction={props.sendAction} />
    : <div className="inventory-empty">No server menu is open.</div>
}

export default function BotViews(props) {
  return (
    <>
      <ViewTabs
        activeView={props.activeView}
        setActiveView={props.setActiveView}
        bot={props.bot}
        openWindow={props.openWindow}
        inventoryItemCount={props.inventoryItemCount}
        savedMessageCount={props.savedMessages.length}
        menuItemCount={props.menuItemCount}
        chatColorsEnabled={props.chatColorsEnabled}
        setChatColorsEnabled={props.setChatColorsEnabled}
      />
      <ActiveView {...props} />
    </>
  )
}