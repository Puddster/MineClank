const usernamePattern = /^[A-Za-z0-9_]{1,16}$/;
const nameCharacterPattern = /^[\p{L}\p{N}_]$/u;

function isNameCharacter(character) {
    return character !== undefined && nameCharacterPattern.test(character);
}

function hasNameBoundaries(text, start, end) {
    const label = Array.from(text.slice(start, end));
    const first = label[0];
    const last = label.at(-1);
    const previous = Array.from(text.slice(0, start)).at(-1);
    const next = Array.from(text.slice(end))[0];

    return !(isNameCharacter(first) && isNameCharacter(previous)) &&
        !(isNameCharacter(last) && isNameCharacter(next));
}

function collectLabels(players) {
    const labels = new Map();
    for (const player of Object.values(players ?? {})) {
        const username = player?.username;
        const label = player?.displayName?.toString?.().trim() || username;
        if (!usernamePattern.test(username ?? '') || !label) continue;

        const usernames = labels.get(label) ?? new Set();
        usernames.add(username);
        labels.set(label, usernames);
    }
    return labels;
}

function collectCandidates(text, labels) {
    const candidates = [];
    for (const [label, usernames] of labels) {
        if (usernames.size !== 1) continue;
        const username = usernames.values().next().value;
        let start = text.indexOf(label);
        while (start !== -1) {
            const end = start + label.length;
            if (hasNameBoundaries(text, start, end)) {
                candidates.push({ start, end, username });
            }
            start = text.indexOf(label, start + 1);
        }
    }
    return candidates;
}

function removeOverlaps(candidates) {
    candidates.sort((a, b) => a.start - b.start || b.end - a.end);
    const links = [];
    let endOfPreviousLink = 0;
    for (const candidate of candidates) {
        if (candidate.start < endOfPreviousLink) continue;
        links.push(candidate);
        endOfPreviousLink = candidate.end;
    }
    return links;
}

export function extractPlayerLinks(text, players) {
    return removeOverlaps(collectCandidates(text, collectLabels(players)));
}
