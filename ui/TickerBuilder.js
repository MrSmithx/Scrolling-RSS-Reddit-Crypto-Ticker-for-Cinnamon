const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Util = imports.misc.util;

const UIUtils = imports.UIUtils.UIUtils;

var TickerBuilder = class TickerBuilder {

    constructor(owner) {
        this.owner = owner;
    }

    rebuild(headlines) {

        const oldOffset =
            this.owner.offset || 0;

        this._buildTickerContent(
            headlines,
            this.owner.tickerBox1
        );

        this.owner.tickerWidth =
            this.owner.tickerBox1
                .get_preferred_width(-1)[1];

        if (this.owner.tickerWidth > 0) {

            this.owner.offset =
                oldOffset %
                this.owner.tickerWidth;
        }

        this.owner.tickerBox1.queue_relayout();

        if (this.owner.tickerClone)
            this.owner.tickerClone.queue_relayout();
    }

    _buildTickerContent(headlines, targetBox) {

        const d = this.owner;

        if (
            d._destroyed ||
            !d.tickerBox1 ||
            !d.tickerContainer
        ) {
            return;
        }

        d._destroyChildrenSafely(targetBox);

        targetBox.x_expand = false;
        targetBox.y_expand = false;

        this._buildCryptoTicker(targetBox);

        this._buildNewsTicker(
            headlines,
            targetBox
        );

        targetBox.queue_relayout();
    }

    _buildCryptoTicker(targetBox) {

        const d = this.owner;

        if (
            !d.showCrypto ||
            !d.cryptoData ||
            d.cryptoData.length === 0
        ) {
            return;
        }

        const repeatCount =
            d._hasNewsFeeds() ? 1 : 6;

        for (let r = 0; r < repeatCount; r++) {

            for (const coin of d.cryptoData) {

                targetBox.add_actor(
                    this._createCryptoRow(coin)
                );

                targetBox.add_actor(
                    d._createSpacer("sep")
                );
            }
        }
    }

    _createCryptoRow(coin) {

        const d = this.owner;

        const isUp =
            coin.change >= 0;

        const color =
            isUp
                ? "#00dd66"
                : "#ff4444";

        const row =
            UIUtils.createActor(
                St.BoxLayout,
                { vertical: false }
            );

        UIUtils.setCenter(row);

        const mainLabel =
            d._createLabel(
                `${coin.symbol} : ${coin.currencySymbol}${coin.price}`
            );

        row.add_actor(mainLabel);

        row.add_actor(
            d._createSpacer()
        );

        const changeLabel =
            d._createLabel(
                `${coin.arrow} ${coin.changeText}%`,
                color
            );

        row.add_actor(changeLabel);

        return row;
    }

    _buildNewsTicker(headlines, targetBox) {

        const d = this.owner;

        if (
            !d._hasNewsFeeds() ||
            !Array.isArray(headlines) ||
            headlines.length === 0
        ) {
            return;
        }

        for (const headline of headlines) {

            targetBox.add_actor(
                this._createNewsButton(headline)
            );

            targetBox.add_actor(
                d._createSpacer("sep")
            );
        }
    }

    _createNewsButton(headline) {

        const d = this.owner;

        const btn = new St.Button({
            reactive: true,
            can_focus: true,
            track_hover: true
        });

        btn.style_class =
            "rss-news-button";

        const row =
            UIUtils.createActor(
                St.BoxLayout,
                { vertical: false }
            );

        const isReddit =
            headline.isReddit === true;

        const showIcon =
            isReddit
                ? d.showRedditIcons
                : d.showFavicons;

        if (
            showIcon &&
            headline.domain
        ) {

            const icon =
                d.faviconManager.createIcon(
                    headline.domain
                );

            if (icon)
                row.add_actor(icon);
        }

        const label =
            d._createLabel(
                headline.title || ""
            );

        row.add_actor(label);

        label._normalStyle = `
            ${d._getFontCSS()}
            color: ${d.fontColor};
        `;

        label._hoverStyle = `
            ${d._getFontCSS()}
            text-decoration: underline;
            color: ${d.fontColor};
        `;

        btn.connect(
            "enter-event",
            () => label.set_style(
                label._hoverStyle
            )
        );

        btn.connect(
            "leave-event",
            () => label.set_style(
                label._normalStyle
            )
        );

        btn.add_actor(row);

        btn._url =
            headline.link;

        btn._signalIds = [];

        btn._signalIds.push(
            btn.connect(
                "clicked",
                actor => {

                    const url =
                        actor._url;

                    if (
                        url &&
                        (
                            url.startsWith("http://") ||
                            url.startsWith("https://")
                        )
                    ) {

                        Util.spawn([
                            "xdg-open",
                            url
                        ]);
                    }
                }
            )
        );

        return btn;
    }
};