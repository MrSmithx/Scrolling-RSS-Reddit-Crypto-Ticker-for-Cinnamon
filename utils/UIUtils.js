const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

function setCenter(actor) {
    actor.x_align = Clutter.ActorAlign.CENTER;
    actor.y_align = Clutter.ActorAlign.CENTER;
}

function setNoExpand(actor) {
    actor.x_expand = false;
    actor.y_expand = false;
}

function appendStyle(actor, style) {
    const current = actor.get_style() || "";
    actor.set_style(current + style);
}

function setFixedWidth(actor, width) {
    appendStyle(actor, `
        min-width: ${width}px;
        max-width: ${width}px;
    `);
}

function parseRGB(color) {
    const match = (color || "").match(
        /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/
    );

    if (!match) {
        return {
            r: 0,
            g: 0,
            b: 0
        };
    }

    return {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3])
    };
}

function clamp(value, min, max, fallback = min) {
    value = parseFloat(value);

    if (isNaN(value))
        value = fallback;

    return Math.min(max, Math.max(min, value));
}

function createActor(Type, props = {}) {
    return new Type({
        x_expand: false,
        y_expand: false,
        ...props
    });
}

var UIUtils = {
    setCenter,
    setNoExpand,
    appendStyle,
    setFixedWidth,
    parseRGB,
    clamp,
    createActor
};