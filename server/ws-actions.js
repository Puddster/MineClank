export function createActionHandlers({ manager, savedMessages, broadcastSavedMessages }) {
    const requireSavedMessages = () => {
        if (!savedMessages) throw new Error('Saved messages are unavailable');
        return savedMessages;
    };

    return new Map([
        ['bot:start', request => manager.start(request.id)],
        ['bot:stop', request => manager.stop(request.id)],
        ['bot:auto-start', request => manager.setAutoStart(request.id, request.enabled)],
        ['bot:auth-reset', request => manager.resetMicrosoftAuthentication(request.id)],
        ['bot:auth-start', request => manager.startMicrosoftAuthentication(request.id)],
        ['bot:skin-refresh', request => manager.refreshMinecraftSkin(request.id)],
        ['bot:profile-create', request => manager.createBotProfile(request.id, request.profile, request.autoStart)],
        ['bot:profile-update', request => manager.updateBotProfile(request.id, request.profile, request.autoStart)],
        ['bot:profile-delete', request => manager.deleteBotProfile(request.id)],
        ['bot:command', request => manager.sendCommand(request.id, request.command)],
        ['bot:complete', async request => ({
            type: 'bot:completion',
            suggestions: await manager.completeCommand(request.id, request.command)
        })],
        ['bot:inventory-move', request => manager.moveInventoryItem(request.id, request.sourceSlot, request.destinationSlot)],
        ['bot:inventory-click', request => manager.clickInventorySlot(
            request.id, request.slot, request.mouseButton, request.mode
        )],
        ['bot:inventory-drop-one', request => manager.dropInventoryItem(request.id, request.slot)],
        ['bot:inventory-drop-stack', request => manager.dropInventoryStack(request.id, request.slot)],
        ['bot:window-click', request => manager.clickOpenWindowSlot(
            request.id, request.windowId, request.slot, request.mouseButton, request.mode
        )],
        ['bot:window-close', request => manager.closeOpenWindow(request.id, request.windowId)],
        ['saved-message:create', request => {
            const result = requireSavedMessages().create(request.entry);
            broadcastSavedMessages();
            return result;
        }],
        ['saved-message:update', request => {
            const result = requireSavedMessages().update(request.messageId, request.entry);
            broadcastSavedMessages();
            return result;
        }],
        ['saved-message:delete', request => {
            const result = requireSavedMessages().delete(request.messageId);
            broadcastSavedMessages();
            return result;
        }]
    ]);
}