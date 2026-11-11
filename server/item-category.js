const equipmentNames = new Set([
    'arrow', 'bow', 'brush', 'carrot_on_a_stick', 'crossbow', 'diamond_horse_armor',
    'elytra', 'firework_rocket', 'fishing_rod', 'flint_and_steel', 'golden_horse_armor',
    'horse_armor', 'iron_horse_armor', 'leather_horse_armor', 'mace', 'netherite_horse_armor',
    'shield', 'shears', 'spectral_arrow', 'spyglass', 'tipped_arrow', 'totem_of_undying',
    'trident', 'warped_fungus_on_a_stick', 'wind_charge', 'wolf_armor'
]);

const equipmentSuffixes = [
    '_sword', '_pickaxe', '_axe', '_shovel', '_hoe',
    '_helmet', '_chestplate', '_leggings', '_boots'
];

const transportNames = new Set(['lead', 'minecart', 'saddle']);
const netherBlockNames = new Set([
    'ancient_debris', 'basalt', 'crying_obsidian', 'glowstone', 'magma_block', 'netherrack',
    'nether_wart_block', 'respawn_anchor', 'shroomlight', 'weeping_vines', 'twisting_vines'
]);
const endBlockNames = new Set(['dragon_egg', 'end_rod', 'end_stone', 'end_stone_bricks']);
const otherBlockNames = new Set([
    'air', 'barrier', 'barrel', 'beacon', 'bedrock', 'bee_nest', 'beehive', 'blast_furnace',
    'brewing_stand', 'cauldron', 'chain_command_block', 'chest', 'chipped_anvil', 'command_block',
    'comparator', 'composter', 'conduit', 'crafting_table', 'crafter', 'daylight_detector',
    'decorated_pot', 'dispenser', 'dropper', 'enchanting_table', 'fletching_table', 'flower_pot',
    'furnace', 'grindstone', 'hopper', 'jigsaw', 'jukebox', 'lectern', 'lever', 'light',
    'loom', 'note_block', 'observer', 'piston', 'piston_head', 'repeating_command_block',
    'repeater', 'redstone_block', 'redstone_torch', 'redstone_wall_torch', 'redstone_wire',
    'scaffolding', 'smithing_table', 'smoker', 'spawner', 'sticky_piston', 'stonecutter',
    'structure_block', 'structure_void', 'target', 'tnt', 'trapped_chest', 'tripwire',
    'tripwire_hook', 'vault', 'void_air'
]);

function getBlockCategory(name) {
    if (name.includes(':')) return 'blocks-other';
    if (endBlockNames.has(name) || /^(chorus_|end_|ender_|purpur_)/.test(name)) return 'blocks-end';
    if (netherBlockNames.has(name) || /^(crimson_|soul_|warped_)/.test(name) || /(?:^|_)(?:nether|blackstone|basalt)(?:_|$)/.test(name)) return 'blocks-nether';
    if (otherBlockNames.has(name) || /^(command_|structure_)/.test(name)) return 'blocks-other';
    return 'blocks-overworld';
}

export function getItemCategory(item, registry) {
    const name = item?.name;
    if (typeof name !== 'string') return 'materials';
    if (name.endsWith('_spawn_egg')) return 'spawn-eggs';
    if (registry?.foodsByName?.[name]) return 'food';
    if (transportNames.has(name) || /_(boat|raft|minecart|harness)$/.test(name)) return 'transport';
    if (equipmentNames.has(name) || equipmentSuffixes.some(suffix => name.endsWith(suffix))) return 'equipment';
    if (registry?.blocksByName?.[name]) return getBlockCategory(name);
    return 'materials';
}