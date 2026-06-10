const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

const UIUtils = imports.UIUtils.UIUtils;

var UIBuilder = class UIBuilder {

    constructor(owner) {

        this.owner = owner;
    }

    build() {

        const d = this.owner;

        d.actor.style_class = "rss-root";

        this._buildContainer();
        this._buildCacheLabel();
        this._buildTickerViewport();
        this._buildFadeWidgets();
        this._buildEmptyLabel();

        d.setContent(d.container);
    }

    _buildContainer() {

        const d = this.owner;

        d.container = UIUtils.createActor(
            St.BoxLayout,
            {
                reactive: true,
                clip_to_allocation: true,
                vertical: false
            }
        );

        d.headlineButton = UIUtils.createActor(
            St.BoxLayout,
            {
                reactive: true,
                track_hover: true,
                can_focus: true
            }
        );

        d.headlineButton.style_class =
            "rss-headline-button";
    }

    _buildCacheLabel() {

        const d = this.owner;

        d.cacheLabel =
            d._createLabel(
                "Offline Cache",
                "#ffaa00",
                `
                    padding-left: 10px;
                    padding-right: 10px;
                    font-weight: bold;
                `
            );

        UIUtils.setCenter(
            d.cacheLabel
        );

        d.cacheLabel.hide();

        d.container.add_actor(
            d.cacheLabel
        );
    }

    _buildTickerViewport() {

        const d = this.owner;

        d.tickerViewport =
            UIUtils.createActor(
                St.Widget,
                {
                    layout_manager:
                        new Clutter.BinLayout(),
                    clip_to_allocation: true
                }
            );

        d.tickerContainer =
            UIUtils.createActor(
                St.Widget,
                {
                    layout_manager:
                        new Clutter.FixedLayout()
                }
            );

        d.tickerBox1 =
            UIUtils.createActor(
                St.BoxLayout,
                {
                    reactive: true
                }
            );

        d.tickerClone =
            new Clutter.Clone({
                source: d.tickerBox1,
                reactive: false
            });

        d.tickerContainer.add_actor(
            d.tickerBox1
        );

        d.tickerContainer.add_actor(
            d.tickerClone
        );

        d.tickerViewport.add_actor(
            d.tickerContainer
        );

        d.headlineButton.add_actor(
            d.tickerViewport
        );

        d.container.add_actor(
            d.headlineButton
        );
    }

    _buildFadeWidgets() {

        const d = this.owner;

        d.leftFade =
            UIUtils.createActor(
                St.Widget,
                {
                    reactive: false
                }
            );

        d.rightFade =
            UIUtils.createActor(
                St.Widget,
                {
                    reactive: false
                }
            );

        d.tickerContainer.add_actor(
            d.leftFade
        );

        d.tickerContainer.add_actor(
            d.rightFade
        );

        d.headlineButton.add_actor(
            d.leftFade
        );

        d.headlineButton.add_actor(
            d.rightFade
        );
    }

    _buildEmptyLabel() {

        const d = this.owner;

        d.emptyLabel =
            d._createLabel(
                "No Feeds Configured"
            );

        UIUtils.setCenter(
            d.emptyLabel
        );

        d.emptyLabel.hide();

        d.tickerViewport.add_actor(
            d.emptyLabel
        );

        d.tickerContainer
            .set_clip_to_allocation(
                false
            );
    }
};