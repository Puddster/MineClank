const standardColors = [
    '#000000', '#aa0000', '#00aa00', '#aa5500',
    '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa',
    '#555555', '#ff5555', '#55ff55', '#ffff55',
    '#5555ff', '#ff55ff', '#55ffff', '#ffffff'
];

function xtermColor(index) {
    if (index < 16) return standardColors[index];
    if (index >= 232) {
        const channel = 8 + (index - 232) * 10;
        return `#${channel.toString(16).padStart(2, '0').repeat(3)}`;
    }

    const cube = index - 16;
    const levels = [0, 95, 135, 175, 215, 255];
    const red = levels[Math.floor(cube / 36)];
    const green = levels[Math.floor((cube % 36) / 6)];
    const blue = levels[cube % 6];
    return `#${[red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function sameStyle(left, right) {
    return left.color === right.color && left.bold === right.bold &&
        left.italic === right.italic && left.underline === right.underline;
}

export function ansiToColorRuns(input) {
    const text = String(input);
    const runs = [];
    const style = { color: null, bold: false, italic: false, underline: false };
    const marker = `${String.fromCharCode(27)}[`;
    let cursor = 0;

    const append = value => {
        if (!value) return;
        const previous = runs.at(-1);
        if (previous && sameStyle(previous, style)) {
            previous.text += value;
        } else {
            runs.push({ text: value, ...style });
        }
    };

    let start = text.indexOf(marker, cursor);
    while (start !== -1) {
        const end = text.indexOf('m', start + marker.length);
        if (end === -1) break;
        const parameterText = text.slice(start + marker.length, end);
        if (!/^[0-9;]*$/.test(parameterText)) {
            start = text.indexOf(marker, end + 1);
            continue;
        }

        append(text.slice(cursor, start));
        const codes = parameterText ? parameterText.split(';').map(Number) : [0];

        for (let index = 0; index < codes.length; index += 1) {
            const code = codes[index];
            if (code === 0) {
                style.color = null;
                style.bold = false;
                style.italic = false;
                style.underline = false;
            } else if (code === 1) {
                style.bold = true;
            } else if (code === 3) {
                style.italic = true;
            } else if (code === 4) {
                style.underline = true;
            } else if (code === 22) {
                style.bold = false;
            } else if (code === 23) {
                style.italic = false;
            } else if (code === 24) {
                style.underline = false;
            } else if (code === 39) {
                style.color = null;
            } else if (code >= 30 && code <= 37) {
                style.color = standardColors[code - 30];
            } else if (code >= 90 && code <= 97) {
                style.color = standardColors[code - 90 + 8];
            } else if (code === 38 && codes[index + 1] === 2 && index + 4 < codes.length) {
                const channels = codes.slice(index + 2, index + 5);
                if (channels.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255)) {
                    style.color = `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
                }
                index += 4;
            } else if (code === 38 && codes[index + 1] === 5 && index + 2 < codes.length) {
                const colorIndex = codes[index + 2];
                if (Number.isInteger(colorIndex) && colorIndex >= 0 && colorIndex <= 255) {
                    style.color = xtermColor(colorIndex);
                }
                index += 2;
            } else if (code === 48) {
                if (codes[index + 1] === 2) index += 4;
                else if (codes[index + 1] === 5) index += 2;
            } else if ((code >= 40 && code <= 49) || (code >= 100 && code <= 107) || code === 7 || code === 8) {
                continue;
            }
        }
        cursor = end + 1;
        start = text.indexOf(marker, cursor);
    }

    append(text.slice(cursor));
    return runs;
}