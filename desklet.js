const St = imports.gi.St;
const Main = imports.ui.main;
const Pango = imports.gi.Pango;
const Clutter = imports.gi.Clutter;
const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;
const PopupMenu = imports.ui.popupMenu;

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
const UIBuilder = imports.UIBuilder.UIBuilder;
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
const FeedController = imports.FeedController.FeedController;
const CallbackManager = imports.CallbackManager.CallbackManager;
const CryptoController = imports.CryptoController.CryptoController;
const TickerController = imports.TickerController.TickerController;
const HeadlineProcessor = imports.HeadlineProcessor.HeadlineProcessor;
const RefreshController = imports.RefreshController.RefreshController;

class RSSDesklet extends Desklet.Desklet {

    constructor(metadata, deskletId) {

        super(metadata);

        this._initMetadata();
        this._initSettings(metadata, deskletId);
        this._initState();
        this.uiBuilder.build();
        this._initEvents();
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
                "maxRedditHeadlines",
                "showRedditSource",
                "showRedditIcons",
                "maxRSSHeadlines",
                "showFavicons",
                "showSource",
                "redditSort",
                "randomise",
                "AllowNSFW"
            ],
            _applyStyle: [
                "backgroundOpacity",
                "backgroundColor",
                "deskletHeight",
                "deskletWidth",
                "textOpacity",
                "fontFamily",
                "enableFade",
                "fontColor"
            ],
            _startTicker: [
                "scrollReverse",
                "speed"
            ],
            _rebuildFromScratch: [
                "enableReddit",
                "showCrypto",
                "showRSS"
            ]
        };

        Object.entries(settingGroups).forEach(([method, keys]) => {
            keys.forEach(key =>
                this._bindSetting(key, this[method])
            );
        });

        this._bindSetting(
            "refreshInterval",
            () => this.refreshController.restartFeedRefresh()
        );

        this._bindSetting(
            "redditRefreshInterval",
            () => this.refreshController.restartRedditRefresh()
        );

        this._bindSetting(
            "cryptoRefreshInterval",
            () => this.refreshController.restartCryptoRefresh()
        );

        this._bindSetting("cryptoCurrency");
        this._bindSetting("cryptoSymbols");
        this._bindSetting("redditFeeds");
        this._bindSetting("feedURLs")

    }

    _initState() {

        this._menuManager = new PopupMenu.PopupMenuManager(this);

        this.refreshController = new RefreshController(this);

        this.cryptoController = new CryptoController(this);

        this.tickerController = new TickerController(this);

        this.headlineProcessor = new HeadlineProcessor();

        this.feedController = new FeedController(this);

        this.faviconManager = new FaviconManager(this);

        this.tickerBuilder = new TickerBuilder(this);

        this.styleManager = new StyleManager(this);

        this.callbacks = new CallbackManager(this);

        this.uiBuilder = new UIBuilder(this);

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
                refresh: () => this.feedsController.fetchFeeds(),
                crypto: () => this.cryptoController.fetchCrypto(),
                rebuild: () => this.feedController.rebuildFromScratch()
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

        this.feedController.restoreCache();
        this.feedController.fetchFeeds();
        this.cryptoController.fetchCrypto();
        this.refreshController.startRedditRefresh();
        this.refreshController.startCryptoRefresh();
        this.refreshController.startFeedRefresh();
        this.tickerController.start();
        this.styleManager.apply();
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

    refreshAllFeeds() {

        this.cryptoController.fetchCrypto();
        this.feedController.fetchFeeds();
    }

    rebuildFeeds() {

        this.feedController.rebuildFromScratch();
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

    // ==================================================
    // SETTINGS CALLBACKS
    // ==================================================

    onCryptoUpdatePressed() {
        return this.callbacks.onCryptoUpdatePressed();
    }

    onFeedsUpdatePressed() {
        return this.callbacks.onFeedsUpdatePressed();
    }

    on_copy_BTC() {
        this.callbacks.onCopyBTC();
    }

    on_copy_ETH() {
        this.callbacks.onCopyETH();
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