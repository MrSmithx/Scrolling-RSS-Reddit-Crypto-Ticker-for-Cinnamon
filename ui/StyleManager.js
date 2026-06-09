const UIUtils = imports.UIUtils.UIUtils;

var StyleManager = class StyleManager {

    constructor(owner) {

        this.owner = owner;
    }

    apply() {

        const d = this.owner;

        if (
            d._destroyed ||
            !d.tickerBox1 ||
            !d.tickerContainer
        ) {
            return;
        }

        const bgOpacity =
            UIUtils.clamp(
                d.backgroundOpacity,
                0,
                1,
                0.5
            );

        d.textOpacity =
            UIUtils.clamp(
                d.textOpacity,
                0,
                1,
                1.0
            );

        d.fontParts =
            d._getFontParts();

        this._calculateDimensions();

        const { r, g, b } =
            UIUtils.parseRGB(
                d.backgroundColor
            );

        this._applyRootStyle();

        this._applyContainerStyle(
            r,
            g,
            b,
            bgOpacity
        );

        this._applyHeadlineButtonStyle();

        this._applyViewportStyle();

        this._applyTickerStyle();

        this._applyFadeStyle(
            r,
            g,
            b,
            bgOpacity
        );

        if (d.lastHeadlines) {

            d.tickerBuilder.rebuild(
                d.lastHeadlines
            );
        }
    }

    _calculateDimensions() {

        const d = this.owner;

        const fontSize =
            d.fontParts.size;

        d.tickerPaddingY =
            d.deskletHeight;

        d.tickerHeight =
            Math.ceil(
                fontSize +
                (d.tickerPaddingY * 2)
            );

        let width =
            parseInt(
                d.deskletWidth
            );

        if (isNaN(width))
            width = 800;

        const monitor =
            global.display.get_monitor_geometry(
                global.display.get_primary_monitor()
            );

        d.calculatedWidth =
            Math.min(
                width,
                monitor.width
            );
    }

    _applyRootStyle() {

        const d = this.owner;

        d.actor.style_class =
            "rss-root";

        UIUtils.setFixedWidth(
            d.actor,
            d.calculatedWidth
        );
    }

    _applyContainerStyle(
        r,
        g,
        b,
        opacity
    ) {

        const d = this.owner;

        d.container.style_class =
            "rss-container";

        d.container.set_style(`
            background-color:
                rgba(
                    ${r},
                    ${g},
                    ${b},
                    ${opacity}
                );
        `);

        UIUtils.setFixedWidth(
            d.container,
            d.calculatedWidth
        );

        UIUtils.setNoExpand(
            d.container
        );
    }

    _applyHeadlineButtonStyle() {

        const d = this.owner;

        d.headlineButton.style_class =
            "rss-headline-button";

        UIUtils.setFixedWidth(
            d.headlineButton,
            d.calculatedWidth
        );

        UIUtils.setNoExpand(
            d.headlineButton
        );
    }

    _applyViewportStyle() {

        const d = this.owner;

        if (!d.tickerViewport)
            return;

        UIUtils.setFixedWidth(
            d.tickerViewport,
            d.calculatedWidth
        );

        d.tickerViewport.width =
            d.calculatedWidth;

        d.tickerViewport.height =
            d.tickerHeight;

        UIUtils.setNoExpand(
            d.tickerViewport
        );
    }

    _applyTickerStyle() {

        const d = this.owner;

        d.tickerContainer.height =
            d.tickerHeight;

        UIUtils.setNoExpand(
            d.tickerContainer
        );

        d.tickerBox1.height =
            d.tickerHeight;

        d.tickerBox1.x_expand =
            false;

        UIUtils.setCenter(
            d.tickerBox1
        );
    }

    _applyFadeStyle(
        r,
        g,
        b,
        opacity
    ) {

        const d = this.owner;

        if (!d.enableFade) {

            d.leftFade.hide();
            d.rightFade.hide();

            return;
        }

        const fadeRGBA =
            `rgba(${r}, ${g}, ${b}, ${opacity})`;

        d.leftFade.set_style(`
            background-gradient-direction: horizontal;
            background-gradient-start: ${fadeRGBA};
            background-gradient-end:
                rgba(${r}, ${g}, ${b}, 0);
        `);

        d.leftFade.set_position(
            0,
            0
        );

        d.leftFade.set_size(
            d.fadeWidth,
            d.tickerHeight
        );

        d.leftFade.show();

        d.rightFade.set_style(`
            background-gradient-direction: horizontal;
            background-gradient-start:
                rgba(${r}, ${g}, ${b}, 0);
            background-gradient-end:
                ${fadeRGBA};
        `);

        d.rightFade.set_position(
            d.calculatedWidth -
            d.fadeWidth,
            0
        );

        d.rightFade.set_size(
            d.fadeWidth,
            d.tickerHeight
        );

        d.rightFade.show();
    }
};