const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const DeskletManager = imports.ui.deskletManager;

const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Pango = imports.gi.Pango;
const Soup = imports.gi.Soup;
const Util = imports.misc.util;

const Clutter = imports.gi.Clutter;

const DESKLET_DIR =
    imports.ui.deskletManager
        .deskletMeta["rssTicker@martyn"]
        .path;

imports.searchPath.unshift(`${DESKLET_DIR}/services`);
imports.searchPath.unshift(`${DESKLET_DIR}/feeds`);
imports.searchPath.unshift(`${DESKLET_DIR}/utils`);
imports.searchPath.unshift(`${DESKLET_DIR}/core`);
imports.searchPath.unshift(`${DESKLET_DIR}/ui`);

const UIUtils = imports.UIUtils.UIUtils;
const FeedParser = imports.FeedParser.FeedParser;
const LoopManager = imports.LoopManager.LoopManager;
const ContextMenu = imports.ContextMenu.ContextMenu;
const FeedService = imports.FeedService.FeedService;
const StyleManager = imports.StyleManager.StyleManager;
const CacheService = imports.CacheService.CacheService;
const CryptoService = imports.CryptoService.CryptoService;
const TickerBuilder = imports.TickerBuilder.TickerBuilder;
const NetworkManager = imports.NetworkManager.NetworkManager;
const FaviconManager = imports.FaviconManager.FaviconManager;
const HeadlineProcessor = imports.HeadlineProcessor.HeadlineProcessor;

class RSSDesklet extends Desklet.Desklet {

    constructor(metadata, deskletId) {

        super(metadata);

        this._initMetadata();
        this._initSettings(metadata, deskletId);
        this._initState();
        this._initUI();
        this._initEvents();
        this._addContextMenu();
        this._startServices();
    }

    _initMetadata() {

        // Disable Cinnamon decorations safely to allow for Opacity
        this.metadata["prevent-decorations"] = true;

        if (this._updateDecoration)
            this._updateDecoration();

    }

    _initSettings(metadata, deskletId) {

        this.settings = new Settings.DeskletSettings(
            this,
            metadata.uuid,
            deskletId
        );

        const settingGroups = {
            _reload: [
                "maxRSSHeadlines",
                "showSource",
                "randomise",
                "showFavicons",
                "maxRedditHeadlines",
                "showRedditSource",
                "showRedditIcons",
                "AllowNSFW",
                "redditSort"
            ],
            _applyStyle: [
                "backgroundOpacity",
                "backgroundColor",
                "deskletWidth",
                "deskletHeight",
                "fontFamily",
                "fontColor",
                "textOpacity",
                "enableFade"
            ],
            _startTicker: [
                "speed",
                "scrollReverse"
            ],
            _rebuildFromScratch: [
                "showRSS",
                "enableReddit",
                "showCrypto"
            ]
        };

        Object.entries(settingGroups).forEach(([method, keys]) => {
            keys.forEach(key =>
                this._bindSetting(key, this[method])
            );
        });

        this._bindSetting("redditRefreshInterval", this._restartRedditRefresh);
        this._bindSetting("cryptoRefreshInterval", this._startCryptoRefresh);
        this._bindSetting("refreshInterval", this._restartRefresh);

        this._bindSetting("cryptoCurrency");
        this._bindSetting("cryptoSymbols");
        this._bindSetting("redditFeeds");
        this._bindSetting("feedURLs")

    }

    _initState() {

        this._menuManager = new PopupMenu.PopupMenuManager(this);

        this.headlineProcessor = new HeadlineProcessor();

        this.faviconManager = new FaviconManager(this);

        this.tickerBuilder = new TickerBuilder(this);

        this.styleManager = new StyleManager(this);

        this.contextMenu = new ContextMenu(this);

        this.network = new NetworkManager();

        this.feedParser = new FeedParser();

        this.cache = new CacheService();

        this.loops = new LoopManager();

        this.cryptoService = new CryptoService(
            this.network.get.bind(this.network),
            this.cache
        );

        this.feedService = new FeedService(
            this.network,
            this.feedParser
        );

        this.contextMenu = new ContextMenu(
            this,
            {
                refresh: () => this._fetchFeeds(),
                crypto: () => this._fetchCrypto(),
                rebuild: () => this._rebuildFromScratch()
            }
        );

        this.offset = 0;

        this.isPaused = false;

        this.cryptoData = [];

        this._loops = {};

        this.fadeWidth = 100;

        this.cryptoSymbolMap = {};

        this._fetchingFeeds = false;

        this.usingCachedData = false;

        this.fontParts = this._getFontParts();

        this.maxRSSHeadlines = this.maxRSSHeadlines || 10;

        this.maxRedditHeadlines = this.maxRedditHeadlines || 10;

        this.feedStats = {
            rssRetrieved: 0,
            redditRetrieved: 0,
            rssAfterLimit: 0,
            redditAfterLimit: 0,
            rssDisplayed: 0,
            redditDisplayed: 0
        };
    }

    _initUI() {

        this.actor.style_class = "rss-root";

        this.container = UIUtils.createActor(St.BoxLayout, {
            reactive: true,
            clip_to_allocation: true,
            vertical: false
        });

        this.headlineButton = UIUtils.createActor(St.BoxLayout, {
            reactive: true,
            track_hover: true,
            can_focus: true
        });

        this.headlineButton.style_class = "rss-headline-button";

        this.cacheLabel = this._createLabel(
            "Offline Cache",
            "#ffaa00",
            `
                padding-left: 10px;
                padding-right: 10px;
                font-weight: bold;
            `
        );

        UIUtils.setCenter(this.cacheLabel);

        this.cacheLabel.hide();

        this.container.add_actor(this.cacheLabel);

        this.tickerViewport = UIUtils.createActor(St.Widget, {
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true
        });

        this.tickerContainer = UIUtils.createActor(St.Widget, {
            layout_manager: new Clutter.FixedLayout()
        });

        this.tickerBox1 = UIUtils.createActor(St.BoxLayout, {
            reactive: true
        });

        this.tickerClone = new Clutter.Clone({
            source: this.tickerBox1,
            reactive: false
        });

        this.tickerContainer.add_actor(this.tickerBox1);
        this.tickerContainer.add_actor(this.tickerClone);

        this.tickerViewport.add_actor(this.tickerContainer);

        this.emptyLabel = this._createLabel(
            "No Feeds Configured"
        );

        UIUtils.setCenter(this.emptyLabel);

        this.emptyLabel.hide();

        this.tickerViewport.add_actor(
            this.emptyLabel
        );

        this.leftFade = UIUtils.createActor(St.Widget, {
            reactive: false
        });

        this.tickerContainer.add_actor(this.leftFade);
        this.headlineButton.add_actor(this.leftFade);

        this.rightFade = UIUtils.createActor(St.Widget, {
            reactive: false
        });

        this.tickerContainer.add_actor(this.rightFade);
        this.headlineButton.add_actor(this.rightFade);

        this.tickerContainer.set_clip_to_allocation(false);

        this.headlineButton.add_actor(this.tickerViewport);

        this.container.add_actor(this.headlineButton);

        this.setContent(this.container);

    }

    _initEvents() {

        this.headlineButton.connect(
            "enter-event",
            () => {
                this.isPaused = true;
            }
        );

        this.headlineButton.connect(
            "leave-event",
            () => {
                this.isPaused = false;
            }
        );

        this.headlineButton.connect(
            "button-release-event",
            () => Clutter.EVENT_PROPAGATE
        );

        this.container.reactive = true;

        this.container.connect(
            "button-release-event",
            (actor, event) => {

                if (event.get_button() === 3) {

                    this._menu.open();

                    return Clutter.EVENT_STOP;
                }

                return Clutter.EVENT_PROPAGATE;
            }
        );
    }

    _startServices() {

        this._loadCache();
        this._fetchFeeds();
        this._fetchCrypto();
        this._startRedditRefresh();
        this._startCryptoRefresh();
        this._startTicker();
        this._startRefresh();
        this._applyStyle();
    }

    _bindSetting(key, callback) {

        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            key,
            key,
            callback ? callback.bind(this) : null,
            null
        );
    }

    // ==================================================
    // HELPERS
    // ==================================================

    _showEmptyMessage(text = "No Feeds Configured") {

        if (!this.emptyLabel)
            return;

        this.emptyLabel.set_text(text);

        this.emptyLabel.show();

        if (this.tickerContainer)
            this.tickerContainer.hide();

        this.tickerWidth = 0;
    }

    _hideEmptyMessage() {

        if (!this.emptyLabel)
            return;

        this.emptyLabel.hide();

        if (this.tickerContainer)
            this.tickerContainer.show();
    }

    _updateCacheIndicator() {

        if (!this.cacheLabel)
            return;

        if (this.usingCachedData)
            this.cacheLabel.show();
        else
            this.cacheLabel.hide();
    }

    _createSpacer(type = "space") {

        let text = "";
        let opacity = 0.0;
        let padding = "5px";

        if (type === "sep") {
            text = "•";
            padding = "15px";
        }

        const sep = this._createLabel(
            text,
            this.fontColor,
            `
                padding-left: ${padding};
                padding-right: ${padding};
                opacity: ${opacity};
            `
        );

        UIUtils.setCenter(sep);

        return sep;
    }

    _getFontParts() {

        let font = this.fontFamily || "Sans Regular 14";

        let sizeMatch = font.match(/(\d+)$/);

        let size = sizeMatch
            ? parseInt(sizeMatch[1])
            : 14;

        let bold =
            /bold/i.test(font);

        let italic =
            /italic/i.test(font);

        let family = font
            .replace(/\d+$/, "")
            .replace(/\b(Bold|Italic|Regular)\b/gi, "")
            .trim();

        return {
            family: family || "Sans",
            size: size,
            weight: bold ? "bold" : "normal",
            style: italic ? "italic" : "normal"
        };
    }

    _getFontCSS() {
        return `
            font-family: "${this.fontParts.family}";
            font-size: ${this.fontParts.size}px;
            font-weight: ${this.fontParts.weight};
            font-style: ${this.fontParts.style};
        `;
    }

    _createLabel(text = "", color = null, extraStyle = "") {

        if (!this.fontParts)
            this.fontParts = this._getFontParts();

        let label = new St.Label({
            text: text
        });

        label.clutter_text.single_line_mode = true;
        label.clutter_text.ellipsize =
            Pango.EllipsizeMode.NONE;

        label.style_class = "rss-label";

        label.set_style(`
            ${this._getFontCSS()}
            color: ${color || this.fontColor};

            ${extraStyle}
        `);

        label.opacity =
            Math.floor(this.textOpacity * 255);

        return label;
    }

    _getRedditFeedList() {

        if (!this.enableReddit)
            return [];

        if (!this.redditFeeds)
            return [];

        const sort =
            this.redditSort || "hot";

        return this.redditFeeds
            .split("\n")
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map(sub =>
                `https://www.reddit.com/r/${sub}/${sort}.rss`
            );
    }

    // ==================================================
    // CONTEXT MENU
    // ==================================================

    _addContextMenu() {

        this._menu = new PopupMenu.PopupMenu(
            this.actor,
            0.0,
            St.Side.TOP
        );

        Main.uiGroup.add_actor(this._menu.actor);

        this._menu.actor.hide();

        this._menuManager.addMenu(this._menu);

        // ---------------------------------
        // Refresh Feeds
        // ---------------------------------

        const updateItem =
            new PopupMenu.PopupIconMenuItem(
                "Update All Feeds",
                "view-refresh-symbolic",
                St.IconType.SYMBOLIC
            );

        updateItem.connect("activate", () => {

            Main.notify(
                "Scrolling RSS, Reddit & Crypto Ticker",
                "Updating Feeds..."
            );

            this._fetchCrypto();

            this._fetchFeeds();
        });

        this._menu.addMenuItem(updateItem);

        const refreshItem =
            new PopupMenu.PopupIconMenuItem(
                "Remove & Refresh All Feeds",
                "edit-delete",
                St.IconType.SYMBOLIC
            );

        refreshItem.connect("activate", () => {

            Main.notify(
                "Scrolling RSS, Reddit & Crypto Ticker",
                "Removing & Refreshing Feeds..."
            );

            Mainloop.idle_add(() => {
                this._rebuildFromScratch();
                return false;
            });
        });

        this.contextMenu.updateLastRefreshTime();

        this._menu.addMenuItem(refreshItem);

        // ---------------------------------
        // Separator
        // ---------------------------------

        this._menu.addMenuItem(
            new PopupMenu.PopupSeparatorMenuItem()
        );

        // ---------------------------------
        // Last Refresh Time
        // ---------------------------------

        this.lastRefreshMenuItem =
            new PopupMenu.PopupMenuItem(
                "Last Refresh: Never"
            );

        this.lastRefreshMenuItem.setSensitive(false);

        this.lastRefreshMenuItem.label.set_style(`
            color: white;
        `);

        this._menu.addMenuItem(
            this.lastRefreshMenuItem
        );

        // ---------------------------------
        // Feed Stats (Sources + Articles)
        // ---------------------------------

        this.feedStatsMenuItem =
            new PopupMenu.PopupMenuItem(
                "Feeds: ..."
            );

        this.feedStatsMenuItem.setSensitive(false);

        this.feedStatsMenuItem.label.set_style(`
            color: white;
        `);

        this._menu.addMenuItem(this.feedStatsMenuItem);

        this.contextMenu.updateFeedStats(this.lastHeadlines || []);
    }

    _applyStyle() {

        if (this._styleLock)
            return;

        this._styleLock = true;

        try {

            this.styleManager.apply();

        } catch (e) {

            global.logError(
                "StyleManager error: " + e
            );

        } finally {

            this._styleLock = false;
        }
    }

    // ==================================================
    // FEEDS
    // ==================================================

    _getFeedList() {

        let feeds = [];

        // =====================================
        // RSS
        // =====================================

        if (
            this.showRSS &&
            this.feedURLs
        ) {

            feeds = feeds.concat(
                this.feedURLs
                    .split("\n")
                    .map(u => u.trim())
                    .filter(u => u.length > 0)
            );
        }

        // =====================================
        // REDDIT
        // =====================================

        if (this.enableReddit) {

            feeds = feeds.concat(
                this._getRedditFeedList()
            );
        }

        return feeds;

    }

    _hasNewsFeeds() {

        const hasRSS =
            this.showRSS &&
            this.feedURLs &&
            this.feedURLs.trim().length > 0;

        const hasReddit =
            this.enableReddit &&
            this.redditFeeds &&
            this.redditFeeds.trim().length > 0;

        return hasRSS || hasReddit;

    }

    _reload() {

        this.lastHeadlines = [];
        this._fetchFeeds();
    }

    _fetchFeeds() {

        if (this._fetchingFeeds)
            return;

        this._fetchingFeeds = true;

        this.contextMenu.updateLastRefreshTime();

        const feeds =
            this._getFeedList();

        if (!feeds.length) {

            this._fetchingFeeds = false;

            if (this.showCrypto) {

                this._hideEmptyMessage();

                this.lastHeadlines = [];

                this.tickerBuilder.rebuild([]);

            } else {

                this._showEmptyMessage(
                    "No Feeds Configured"
                );
            }

            return;
        }

        this.feedService.fetch(
            feeds,
            {
                allowNSFW:
                    this.AllowNSFW,

                showSource:
                    this.showSource,

                showRedditSource:
                    this.showRedditSource
            },
            result => {

                this._fetchingFeeds = false;

                const processed =
                    this.headlineProcessor.process(
                        result.rss,
                        result.reddit,
                        {
                            randomise:
                                this.randomise,

                            maxRSSHeadlines:
                                this.maxRSSHeadlines,

                            maxRedditHeadlines:
                                this.maxRedditHeadlines
                        }
                    );

                // Cache fallback

                if (
                    processed.headlines.length === 0 &&
                    this.lastHeadlines &&
                    this.lastHeadlines.length > 0
                ) {

                    this.usingCachedData = true;

                    this._updateCacheIndicator();

                    this.tickerBuilder.rebuild(
                        this.lastHeadlines
                    );

                    return;
                }

                this.feedStats =
                    processed.stats;

                this.lastHeadlines =
                    processed.headlines;

                if (
                    this.lastHeadlines.length > 0 ||
                    this.showCrypto
                ) {

                    this._hideEmptyMessage();

                } else {

                    this._showEmptyMessage(
                        "No Feeds Configured"
                    );
                }

                this.usingCachedData = false;

                this._updateCacheIndicator();

                this.tickerBuilder.rebuild(
                    this.lastHeadlines
                );

                this.contextMenu.updateFeedStats();

                this._saveCache();
            }
        );
    }

    _rebuildFromScratch() {

        // Stop ticker to avoid mid-scroll mutation
        this._stopTicker();

        // Reset state that affects layout/scroll
        this.offset = 0;
        this.pendingHeadlines = null;
        this.lastHeadlines = [];

        // Clear UI safely
        this._destroyChildrenSafely(this.tickerBox1);

        // Re-fetch everything fresh
        this._fetchFeeds();

        // Restart ticker after rebuild
        this._startTicker();
    }

    // ==================================================
    // CRYPTO
    // ==================================================

    _fetchCrypto() {

        if (!this.showCrypto) {

            this._fetchFeeds();

            return;
        }

        const symbols =
            (this.cryptoSymbols || "bitcoin\nethereum")
            .split("\n")
            .map(s => s.trim())
            .filter(Boolean);

        const currency =
            (this.cryptoCurrency || "usd").toLowerCase();

        this.cryptoService.fetch(symbols, currency, cryptoData => {

                if (!cryptoData)
                    return;

                this.cryptoData = cryptoData;

                this.tickerBuilder.rebuild(
                    this.lastHeadlines || []
                );
            }
        );
    }

    _startCryptoRefresh() {

        const interval =
            Math.max(
                1,
                this.cryptoRefreshInterval || 5
            ) * 60;

        this.loops.add(
            "crypto",
            interval,
            () => {

                this._fetchCrypto();

                return true;
            },
            true
        );
    }

    _stopCryptoRefresh() {

        this.loops.remove("crypto");
    }

    _startRedditRefresh() {

        const interval =
            Math.max(
                1,
                this.redditRefreshInterval || 10
            ) * 60;

        this.loops.add(
            "reddit",
            interval,
            () => {

                if (this.enableReddit) {
                    this._fetchFeeds();
                }

                return true;
            },
            true
        );
    }

    _stopRedditRefresh() {
        this.loops.remove("reddit");
    }

    _restartRedditRefresh() {
        this._stopRedditRefresh();
        this._startRedditRefresh();
    }

    // ==================================================
    // SETTINGS CALLBACKS
    // ==================================================

    onCryptoUpdatePressed() {

        // Re-fetch crypto using latest settings
        this._fetchCrypto();
    }

    onFeedsUpdatePressed() {

        // Re-fetch RSS & Reddit using latest settings
        this._fetchFeeds();
    }

    _copyToClipboard(text) {
        St.Clipboard.get_default().set_text(
            St.ClipboardType.CLIPBOARD,
            text
        );
    }

    on_copy_BTC() {
        this._copyToClipboard("1PRxxyxpz6Qh5sgdKn1TKKh2NZed3B7NX9");
        Main.notify("Bitcoin Address Copied", "Your Support is Greatly Appreciated.");
    }

    on_copy_ETH() {
        this._copyToClipboard("0xe1cA43145846fb476FED56645FCbA0B9B55be79B");
        Main.notify("Ethereum Address Copied", "Your Support is Greatly Appreciated.");
    }

    // ==================================================
    // TICKER
    // ==================================================

    _startTicker() {

        this.offset = 0;

        const step =
            Math.max(0.5, this.speed / 2);

        this.loops.add(
            "ticker",
            25,
            () => {

                if (this.isPaused)
                    return true;

                if (this._destroyed || !this.tickerBox1 || !this.tickerClone)
                    return true;

                const width1 =
                    this.tickerWidth || 0;

                if (width1 <= 0)
                    return true;

                const direction =
                    this.scrollReverse ? -1 : 1;

                this.offset += step * direction;

                if (!this.scrollReverse) {

                    if (this.offset >= width1)
                        this.offset -= width1;

                } else {

                    if (this.offset < 0)
                        this.offset += width1;
                }

                this.tickerBox1.set_position(
                    -this.offset,
                    0
                );

                this.tickerClone.set_position(
                    width1 - this.offset,
                    0
                );

                return true;
            }
        );
    }

    _stopTicker() {

        this.loops.remove("ticker");
    }

    // ==================================================
    // REFRESH
    // ==================================================

    _startRefresh() {

        const interval =
            Math.max(
                1,
                this.refreshInterval
            ) * 60;

        this.loops.add(
            "refresh",
            interval,
            () => {

                this._fetchFeeds();

                return true;
            },
            true
        );
    }

    _stopRefresh() {

        this.loops.remove("refresh");
    }

    _restartRefresh() {

        this._stopRefresh();
        this._startRefresh();
    }

    // ==================================================
    // CACHE
    // ==================================================

    _saveCache() {

        this.cache.saveRSSCache(
            this.lastHeadlines || [],
            this.cryptoData || []
        );
    }

    _loadCache() {

        const cache =
            this.cache.loadRSSCache();

        if (!cache)
            return false;

        if (Array.isArray(cache.headlines)) {
            this.lastHeadlines = cache.headlines;
        }

        if (Array.isArray(cache.cryptoData)) {
            this.cryptoData = cache.cryptoData;
        }

        this.contextMenu.updateFeedStats(this.lastHeadlines || []);

        this.tickerBuilder.rebuild(
            this.lastHeadlines || []
        );

        return true;
    }

    // ==================================================
    // CLEANUP
    // ==================================================

    on_desklet_removed() {

        this._destroyed = true;

        if (this._cancellable)
            this._cancellable.cancel();

        this.loops.clear();

        this.tickerBox1 = null;
        this.container = null;
        this.labelActors = null;
        this.cryptoData = null;
        this.lastHeadlines = null;

        this.tickerClone?.destroy();
        this.tickerClone = null;

        this.leftFade?.destroy();
        this.leftFade = null;
        this.rightFade?.destroy();
        this.rightFade = null;
    
    }

    _destroyActorRecursive(actor) {

        if (!actor)
            return;

        // disconnect signals
        if (actor._signalIds) {
            actor._signalIds.forEach(id => {
                try { actor.disconnect(id); } catch (e) {}
            });
            actor._signalIds = null;
        }

        // destroy children first (if container)
        if (actor.get_children) {
            actor.get_children().forEach(child =>
                this._destroyActorRecursive(child)
            );
        }

        try {
            actor.destroy();
        } catch (e) {}
    }

    _destroyChildrenSafely(container) {

        if (!container)
            return;

        container.get_children().forEach(child =>
            this._destroyActorRecursive(child)
        );
    }

};

function main(metadata, deskletId) {
    return new RSSDesklet(metadata, deskletId);
}