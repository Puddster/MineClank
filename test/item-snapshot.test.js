import assert from 'node:assert/strict';
import test from 'node:test';
import { inventorySnapshot } from '../server/item-snapshot.js';

function snapshotItem(item, registry) {
    return inventorySnapshot({ inventory: { slots: [item] }, registry })[0];
}

test('reads shulker box contents from the 1.20.5+ container component', () => {
    const registry = {
        items: {
            5: { name: 'diamond', displayName: 'Diamond' },
            9: { name: 'oak_log', displayName: 'Oak Log' }
        }
    };
    const item = {
        name: 'shulker_box',
        displayName: 'Shulker Box',
        count: 1,
        componentMap: new Map([['container', {
            type: 'container',
            data: {
                contents: [
                    { itemCount: 0 },
                    { itemId: 5, itemCount: 64, components: [] },
                    {
                        itemId: 9,
                        itemCount: 12,
                        components: [{ type: 'custom_name', data: { type: 'compound', value: { text: { type: 'string', value: 'Lucky Log' } } } }]
                    }
                ]
            }
        }]])
    };
    assert.deepEqual(snapshotItem(item, registry).containerItems, [
        { slot: 1, name: 'diamond', category: 'materials', displayName: 'Diamond', count: 64, customName: null },
        { slot: 2, name: 'oak_log', category: 'materials', displayName: 'Oak Log', count: 12, customName: 'Lucky Log' }
    ]);
});

test('reads shulker box contents from legacy BlockEntityTag NBT', () => {
    const registry = { itemsByName: { cobblestone: { name: 'cobblestone', displayName: 'Cobblestone' } } };
    const item = {
        name: 'red_shulker_box',
        displayName: 'Red Shulker Box',
        count: 1,
        nbt: {
            value: {
                BlockEntityTag: {
                    value: {
                        Items: {
                            value: {
                                value: [
                                    { Slot: { value: 3 }, id: { value: 'minecraft:cobblestone' }, Count: { value: 32 } },
                                    { Slot: { value: 4 }, id: { value: 7 }, Count: { value: 1 } }
                                ]
                            }
                        }
                    }
                }
            }
        }
    };
    assert.deepEqual(snapshotItem(item, registry).containerItems, [
        { slot: 3, name: 'cobblestone', category: 'materials', displayName: 'Cobblestone', count: 32, customName: null }
    ]);
});

test('returns no container items for items without stored contents', () => {
    assert.deepEqual(snapshotItem({ name: 'stone', displayName: 'Stone', count: 1 }, {}).containerItems, []);
    assert.deepEqual(snapshotItem({
        name: 'shulker_box',
        displayName: 'Shulker Box',
        count: 1,
        componentMap: new Map([['container', { type: 'container', data: { contents: [] } }]])
    }, {}).containerItems, []);
});
