import { getItemCategory } from './item-category.js';

const maxItemTextLength = 160;

function parseComponentString(value, depth) {
    try {
        return flattenComponentText(JSON.parse(value), depth + 1);
    } catch {
        return value;
    }
}

function flattenComponentText(node, depth = 0) {
    if (depth > 8) return '';
    if (typeof node === 'string') return parseComponentString(node, depth);
    if (Array.isArray(node)) return node.map(child => flattenComponentText(child, depth + 1)).join('');
    if (!node || typeof node !== 'object') return '';
    if (node.type === 'string' && typeof node.value === 'string') return node.value;
    if (node.type === 'list') return flattenComponentText(node.value?.value ?? node.value, depth + 1);

    const content = node.type === 'compound' ? node.value : node;
    if (!content || typeof content !== 'object') return '';
    return flattenComponentText(content.text, depth + 1) + flattenComponentText(content.extra, depth + 1);
}

export function itemComponentText(value) {
    return flattenComponentText(value).slice(0, maxItemTextLength);
}

function componentEnchantments(component) {
    if (Array.isArray(component)) return component;
    return Array.isArray(component?.enchantments) ? component.enchantments : [];
}

function enchantmentName(enchantment, registry) {
    if (typeof enchantment?.name === 'string') return enchantment.name;
    if (Number.isInteger(enchantment?.id)) return registry?.enchantments?.[enchantment.id]?.name ?? null;
    if (typeof enchantment?.id === 'string') return enchantment.id.replace(/^minecraft:/, '');
    return null;
}

function enchantmentLevel(enchantment) {
    if (Number.isInteger(enchantment?.lvl)) return enchantment.lvl;
    return Number.isInteger(enchantment?.level) ? enchantment.level : 0;
}

function normalizeEnchantments(enchantments, registry) {
    return enchantments.slice(0, 12)
        .map(enchantment => ({
            name: enchantmentName(enchantment, registry)?.slice(0, 80) ?? null,
            level: enchantmentLevel(enchantment)
        }))
        .filter(enchantment => enchantment.name);
}

function readEnchantments(item, registry) {
    try {
        let rawEnchantments = Array.isArray(item.enchants) ? item.enchants : [];
        const standard = componentEnchantments(item.componentMap?.get('enchantments')?.data);
        const stored = componentEnchantments(item.componentMap?.get('stored_enchantments')?.data);
        if (!rawEnchantments.length) rawEnchantments = standard;
        if (!rawEnchantments.length) rawEnchantments = stored;
        const override = item.componentMap?.get('enchantment_glint_override')?.data;
        return {
            enchantments: normalizeEnchantments(rawEnchantments, registry),
            hasEnchantmentGlint: typeof override === 'boolean' ? override : rawEnchantments.length > 0
        };
    } catch {
        return { enchantments: [], hasEnchantmentGlint: false };
    }
}

function readLore(item) {
    try {
        const rawLore = item.customLore;
        const lines = Array.isArray(rawLore) ? rawLore : typeof rawLore === 'string' ? [rawLore] : [];
        return lines.slice(0, 8).map(itemComponentText).filter(Boolean);
    } catch {
        return [];
    }
}

function readCustomName(item) {
    try {
        const name = item.componentMap?.get('item_name')?.data;
        return itemComponentText(item.customName ?? name) || null;
    } catch {
        return null;
    }
}

function itemSlotSnapshot(item, slot, registry) {
    if (!item) return null;
    const displayName = typeof item.displayName === 'string'
        ? item.displayName
        : item.displayName?.toString?.();
    const { enchantments, hasEnchantmentGlint } = readEnchantments(item, registry);
    return {
        slot,
        name: item.name || 'Unknown item',
        category: getItemCategory(item, registry),
        displayName: displayName || item.name || 'Unknown item',
        count: Number.isInteger(item.count) ? item.count : 1,
        customName: readCustomName(item),
        enchantments,
        hasEnchantmentGlint,
        lore: readLore(item)
    };
}

function itemSlotsSnapshot(slots, registry) {
    if (!Array.isArray(slots)) return [];
    return slots.map((item, slot) => itemSlotSnapshot(item, slot, registry));
}

export function inventorySnapshot(bot) {
    return itemSlotsSnapshot(bot?.inventory?.slots, bot?.registry);
}

export function openWindowSnapshot(window, registry) {
    if (!window) return null;
    return {
        id: window.id,
        title: window.title?.toString?.() || String(window.title || 'Server Menu'),
        type: String(window.type || 'container'),
        inventoryStart: Number.isInteger(window.inventoryStart) ? window.inventoryStart : window.slots?.length || 0,
        slots: itemSlotsSnapshot(window.slots, registry),
        selectedItem: window.selectedItem ? itemSlotsSnapshot([window.selectedItem], registry)[0] : null
    };
}