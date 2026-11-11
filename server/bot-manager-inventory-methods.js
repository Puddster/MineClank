import { itemComponentText } from './item-snapshot.js';

export const botManagerInventoryMethods = {
    moveInventoryItem(id, sourceSlot, destinationSlot) {
        return this.queueInventoryAction(id, sourceSlot, async (bot, item, record) => {
            this.validateInventorySlot(bot, destinationSlot);
            if (sourceSlot === destinationSlot) throw new Error('Choose a different destination slot');
            if (bot.inventory.slots[destinationSlot]) throw new Error('Destination slot must be empty');
            if (typeof bot.moveSlotItem !== 'function') throw new Error('Inventory moves are unavailable');
            await bot.moveSlotItem(sourceSlot, destinationSlot);
            this.appendLog(record, `Inventory: moved ${item.count} x ${this.inventoryItemName(item)} from slot ${sourceSlot} to ${destinationSlot}`);
            return { id, sourceSlot, destinationSlot, moved: item.count };
        });
    },

    dropInventoryItem(id, slot) {
        return this.queueInventoryAction(id, slot, async (bot, item, record) => {
            if (typeof bot.clickWindow !== 'function') throw new Error('Inventory drops are unavailable');
            await bot.clickWindow(slot, 0, 4);
            this.appendLog(record, `Inventory: dropped 1 x ${this.inventoryItemName(item)} from slot ${slot}`);
            return { id, slot, dropped: 1 };
        });
    },

    dropInventoryStack(id, slot) {
        return this.queueInventoryAction(id, slot, async (bot, item, record) => {
            if (typeof bot.tossStack !== 'function') throw new Error('Stack drops are unavailable');
            await bot.tossStack(item);
            this.appendLog(record, `Inventory: dropped stack of ${this.inventoryItemName(item)} from slot ${slot}`);
            return { id, slot, dropped: item.count };
        });
    },

    clickInventorySlot(id, slot, mouseButton = 0, mode = 0) {
        const record = this.requireRecord(id);
        const run = async () => {
            const bot = this.requireOnlineBot(record);
            if (bot.currentWindow) throw new Error('Close the open server menu before managing inventory');
            this.validateInventorySlot(bot, slot);
            validateClick(mouseButton, mode, 'inventory');
            if (typeof bot.clickWindow !== 'function') throw new Error('Inventory clicks are unavailable');
            const item = bot.inventory.slots[slot];
            await bot.clickWindow(slot, mouseButton, mode);
            this.appendLog(record, `Inventory: ${clickName(mouseButton, mode)} ${item ? this.inventoryItemName(item) : 'empty slot'} in slot ${slot}`);
            this.emitState(record);
            return { id, slot, mouseButton, mode, clicked: item ? this.inventoryItemName(item) : null };
        };
        return queueAction(record, 'inventoryActionQueue', run);
    },

    clickOpenWindowSlot(id, windowId, slot, mouseButton = 0, mode = 0) {
        const record = this.requireRecord(id);
        const run = async () => {
            const bot = this.requireOnlineBot(record);
            const window = bot.currentWindow;
            if (!window || window.id !== windowId) throw new Error('The server menu has changed or closed');
            if (!Number.isInteger(slot) || slot < 0 || slot >= window.slots.length) {
                throw new Error('Window slot is out of range');
            }
            validateClick(mouseButton, mode, 'window');
            if (typeof bot.clickWindow !== 'function') throw new Error('Server menu clicks are unavailable');
            const item = window.slots[slot];
            await bot.clickWindow(slot, mouseButton, mode);
            this.appendLog(record, `Menu: ${clickName(mouseButton, mode)} ${item ? this.inventoryItemName(item) : 'empty slot'} in slot ${slot}`);
            this.emitState(record);
            return { id, slot, mouseButton, mode, clicked: item ? this.inventoryItemName(item) : null };
        };
        return queueAction(record, 'windowActionQueue', run);
    },

    async closeOpenWindow(id, windowId) {
        const record = this.requireRecord(id);
        const bot = this.requireOnlineBot(record);
        const window = bot.currentWindow;
        if (!window || window.id !== windowId) throw new Error('The server menu has changed or closed');
        if (typeof bot.closeWindow !== 'function') throw new Error('Closing the server menu is unavailable');
        await bot.closeWindow(window);
        this.appendLog(record, `Menu: closed ${window.title?.toString?.() || 'server menu'}`);
        this.emitState(record);
        return { id, closed: true };
    },

    queueInventoryAction(id, slot, operation) {
        const record = this.requireRecord(id);
        const run = async () => {
            const bot = this.requireOnlineBot(record);
            if (bot.currentWindow) throw new Error('Close the open container before managing inventory');
            this.validateInventorySlot(bot, slot);
            const item = bot.inventory.slots[slot];
            if (!item) throw new Error(`Inventory slot ${slot} is empty`);
            const result = await operation(bot, item, record);
            this.emitState(record);
            return result;
        };
        return queueAction(record, 'inventoryActionQueue', run);
    },

    validateInventorySlot(bot, slot) {
        if (!Number.isInteger(slot) || slot < 5 || slot >= (bot.inventory?.slots?.length || 0)) {
            throw new Error('Inventory slot is out of range');
        }
    },

    inventoryItemName(item) {
        return itemComponentText(item.customName ?? item.componentMap?.get('item_name')?.data) ||
            item.displayName || item.name || 'Unknown item';
    }
};

function validateClick(mouseButton, mode, context) {
    if (![0, 1].includes(mouseButton) || ![0, 1].includes(mode)) {
        throw new Error(`Unsupported ${context} click`);
    }
}

function clickName(mouseButton, mode) {
    if (mode === 1) return 'shift-clicked';
    return mouseButton === 1 ? 'right-clicked' : 'clicked';
}

function queueAction(record, queueName, run) {
    const action = record[queueName].then(run, run);
    record[queueName] = action.catch(() => {});
    return action;
}