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
imports.searchPath.unshift(`${DESKLET_DIR}/utils`);
imports.searchPath.unshift(`${DESKLET_DIR}/ui`);
imports.searchPath.unshift(`${DESKLET_DIR}/core`);

const UIUtils = imports.UIUtils.UIUtils;
const FeedParser = imports.FeedParser.FeedParser;
const CacheService = imports.CacheService.CacheService;
const CryptoService = imports.CryptoService.CryptoService;
const TickerBuilder = imports.TickerBuilder.TickerBuilder;
const NetworkManager = imports.NetworkManager.NetworkManager;
const LoopManager = imports.LoopManager.LoopManager;
const ContextMenu = imports.ContextMenu.ContextMenu;

class RSSDesklet extends Desklet.Desklet {

    constructor(metadata, deskletId) {

        super(metadata);

        this._menuManager = new PopupMenu.PopupMenuManager(this);

        this.contextMenu = new ContextMenu(
            this,
            {
                refresh: () => this._fetchFeeds(),
                crypto: () => this._fetchCrypto(),
                rebuild: () => this._rebuildFromScratch()
            }
        );

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

        this._bindSetting("refreshInterval", this._restartRefresh);
        this._bindSetting("redditRefreshInterval", this._restartRedditRefresh);
        this._bindSetting("cryptoRefreshInterval", this._startCryptoRefresh);

        this._bindSetting("cryptoSymbols");
        this._bindSetting("cryptoCurrency");
        this._bindSetting("feedURLs")
        this._bindSetting("redditFeeds");

    }

    _initState() {

        this.network = new NetworkManager();

        this.feedParser = new FeedParser();

        this.cache = new CacheService();

        this.cryptoService = new CryptoService(
            this.network.get.bind(this.network),
            this.cache
        );

        this.loops = new LoopManager();

        this.tickerBuilder = new TickerBuilder(this);

        this.contextMenu = new ContextMenu(this);

        this.offset = 0;

        this.isPaused = false;

        this.fontParts = this._getFontParts();

        this.cryptoData = [];

        this.usingCachedData = false;

        this._loops = {};

        this.cryptoSymbolMap = {};

        this.fadeWidth = 100;

        this._fetchingFeeds = false;

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

    // ==================================================
    // STYLE
    // ==================================================

    _calculateDimensions() {

        const fontSize = this.fontParts.size;

        this.tickerPaddingY = this.deskletHeight;

        this.tickerHeight =
            Math.ceil(fontSize + (this.tickerPaddingY * 2));

        let width = parseInt(this.deskletWidth);

        if (isNaN(width))
            width = 800;

        const monitor = global.display.get_monitor_geometry(
            global.display.get_primary_monitor()
        );

        width = Math.min(width, monitor.width);

        this.calculatedWidth = width;
    }

    _applyRootStyle() {

        this.actor.style_class = "rss-root";

        UIUtils.setFixedWidth(
            this.actor,
            this.calculatedWidth
        );
    }

    _applyContainerStyle(r, g, b, bgOpacity) {

        this.container.style_class = "rss-container";

        this.container.set_style(`
            background-color:
                rgba(${r}, ${g}, ${b}, ${bgOpacity});
        `);

        UIUtils.setFixedWidth(
            this.container,
            this.calculatedWidth
        );

        UIUtils.setNoExpand(this.container);
    }

    _applyHeadlineButtonStyle() {

        this.headlineButton.style_class =
            "rss-headline-button";

        UIUtils.setFixedWidth(
            this.headlineButton,
            this.calculatedWidth
        );

        UIUtils.setNoExpand(this.headlineButton);
    }

    _applyViewportStyle() {

        if (!this.tickerViewport)
            return;

        UIUtils.setFixedWidth(
            this.tickerViewport,
            this.calculatedWidth
        );

        this.tickerViewport.width =
            this.calculatedWidth;

        this.tickerViewport.height =
            this.tickerHeight;

        UIUtils.setNoExpand(this.tickerViewport);
    }

    _applyTickerStyle() {

        this.tickerContainer.height =
            this.tickerHeight;

        UIUtils.setNoExpand(this.tickerContainer);

        this.tickerBox1.height =
            this.tickerHeight;

        this.tickerBox1.x_expand = false;

        UIUtils.setCenter(this.tickerBox1);
    }

    _applyFadeStyle(r, g, b, bgOpacity) {

        if (!this.enableFade) {

            this.leftFade.hide();
            this.rightFade.hide();

            return;
        }

        const fadeRGBA =
            `rgba(${r}, ${g}, ${b}, ${bgOpacity})`;

        // LEFT

        this.leftFade.set_style(`
            background-gradient-direction: horizontal;
            background-gradient-start: ${fadeRGBA};
            background-gradient-end:
                rgba(${r}, ${g}, ${b}, 0);
        `);

        this.leftFade.set_position(0, 0);

        this.leftFade.set_size(
            this.fadeWidth,
            this.tickerHeight
        );

        this.leftFade.show();

        // RIGHT

        this.rightFade.set_style(`
            background-gradient-direction: horizontal;
            background-gradient-start:
                rgba(${r}, ${g}, ${b}, 0);
            background-gradient-end: ${fadeRGBA};
        `);

        this.rightFade.set_position(
            this.calculatedWidth - this.fadeWidth,
            0
        );

        this.rightFade.set_size(
            this.fadeWidth,
            this.tickerHeight
        );

        this.rightFade.show();
    }

    _rebuildIfNeeded() {

        if (!this.lastHeadlines)
            return;

        this.tickerBuilder.rebuild(
            this.lastHeadlines
        );
    }

    _applyStyle() {

        if (
            this._destroyed ||
            !this.tickerBox1 ||
            !this.tickerContainer
        ) {
            return;
        }

        if (this._styleLock)
            return;

        this._styleLock = true;

        try {

            const bgOpacity =
                UIUtils.clamp(
                    this.backgroundOpacity,
                    0,
                    1,
                    0.5
                );

            this.textOpacity =
                UIUtils.clamp(
                    this.textOpacity,
                    0,
                    1,
                    1.0
                );

            this.fontParts =
                this._getFontParts();

            this._calculateDimensions();

            const { r, g, b } =
                UIUtils.parseRGB(
                    this.backgroundColor
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

            this._rebuildIfNeeded();

        } catch (e) {

            global.logError(
                "RSSDesklet _applyStyle error: " + e
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

    _getFaviconDir() {

        let dir = GLib.build_filenamev([
            GLib.get_user_cache_dir(),
            "rss-desklet-icons"
        ]);

        GLib.mkdir_with_parents(dir, 0o755);

        return dir;
    }

    _getFaviconPath(domain) {

        return GLib.build_filenamev([
            this._getFaviconDir(),
            domain + ".png"
        ]);
    }

    _fetchFavicon(domain) {

        if (!domain)
            return;

        let path =
            this._getFaviconPath(domain);

        // Already cached
        if (GLib.file_test(path, GLib.FileTest.EXISTS))
            return;

        let url =
            `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

        this.network.download(url, path);
    }

    _reload() {

        this.lastHeadlines = [];
        this._fetchFeeds();
    }

    _fetchFeeds() {

        if (this._fetchingFeeds) {

            global.log(
                "Feed refresh already running, skipping"
            );

            return;
        }

        this._fetchingFeeds = true;

        this.contextMenu.updateLastRefreshTime();

        let feeds = this._getFeedList();

        // =====================================
        // NO NEWS FEEDS
        // =====================================

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

        let pending = feeds.length;

        let rssHeadlines = [];
        let redditHeadlines = [];

        feeds.forEach(feedURL => {

            this.network.get(feedURL, stdout => {

            if (!stdout) {

                pending--;

                // If ALL feeds failed and we already have cache,
                // keep the cached headlines instead of clearing UI
                if (pending <= 0) {

                    this._fetchingFeeds = false;

                    const allHeadlines =
                        rssHeadlines.concat(redditHeadlines);

                    if (allHeadlines.length > 0) {

                        this._finalizeHeadlines(allHeadlines);

                    } else if (this.lastHeadlines &&
                               this.lastHeadlines.length > 0) {

                        global.log("Using cached RSS headlines");

                        this.usingCachedData = true;
                        this._updateCacheIndicator();

                        this.tickerBuilder.rebuild(this.lastHeadlines);

                    } else {

                        this._finalizeHeadlines([]);
                    }
                }

                return;
            }

                try {

                let items = this.feedParser.parse(stdout, feedURL, {
                    allowNSFW: this.AllowNSFW,
                    showSource: this.showSource,
                    showRedditSource: this.showRedditSource
                });

                // classify
                if (items.length > 0 && items[0].isReddit) {
                    redditHeadlines = redditHeadlines.concat(items);
                } else {
                    rssHeadlines = rssHeadlines.concat(items);
                }

                } catch (e) {

                    global.logError(e);
                }

                pending--;

                if (pending <= 0) {

                    this._fetchingFeeds = false;

                    const allHeadlines =
                        rssHeadlines.concat(redditHeadlines);

                    this._finalizeHeadlines(allHeadlines);
                }
            });
        });
    }

    _finalizeHeadlines(incomingHeadlines) {

        this._fetchingFeeds = false;

        // -----------------------------
        // split by type (from incoming)
        // -----------------------------
        let rssHeadlines =
            incomingHeadlines.filter(h => !h.isReddit);

        let redditHeadlines =
            incomingHeadlines.filter(h => h.isReddit);

        this.feedStats.rssRetrieved =
            rssHeadlines.length;

        this.feedStats.redditRetrieved =
            redditHeadlines.length;

        // Randomise individual feeds before limiting
        if (this.randomise) {

            const shuffle = arr => {
                for (let i = arr.length - 1; i > 0; i--) {
                    const j =
                        Math.floor(Math.random() * (i + 1));

                    [arr[i], arr[j]] =
                        [arr[j], arr[i]];
                }
            };

            shuffle(rssHeadlines);
            shuffle(redditHeadlines);
        }

        // -----------------------------
        // apply separate limits
        // -----------------------------
        rssHeadlines =
            rssHeadlines.slice(0, this.maxRSSHeadlines || 10);

        redditHeadlines =
            redditHeadlines.slice(0, this.maxRedditHeadlines || 10);

        this.feedStats.rssAfterLimit =
            rssHeadlines.length;

        this.feedStats.redditAfterLimit =
            redditHeadlines.length;

        // -----------------------------
        // merge FINAL result
        // -----------------------------
        let finalHeadlines =
            rssHeadlines.concat(redditHeadlines);

        // -----------------------------
        // empty handling
        // -----------------------------
        if (finalHeadlines.length > 0 || this.showCrypto) {
            this._hideEmptyMessage();
        }

        this.usingCachedData = false;
        this._updateCacheIndicator();

        // -----------------------------
        // deduplicate
        // -----------------------------
        let seen = {};
        finalHeadlines = finalHeadlines.filter(h => {
            if (seen[h.link]) return false;
            seen[h.link] = true;
            return true;
        });

        this.feedStats.rssDisplayed =
            finalHeadlines.filter(h => !h.isReddit).length;

        this.feedStats.redditDisplayed =
            finalHeadlines.filter(h => h.isReddit).length;

        // -----------------------------
        // randomise ALL limited feeds
        // -----------------------------
        if (this.randomise) {
            for (let i = finalHeadlines.length - 1; i > 0; i--) {
                let j = Math.floor(Math.random() * (i + 1));
                [finalHeadlines[i], finalHeadlines[j]] =
                    [finalHeadlines[j], finalHeadlines[i]];
            }
        }

        // -----------------------------
        // update buffer (clean version)
        // -----------------------------
        this.lastHeadlines = finalHeadlines;

        this.tickerBuilder.rebuild(this.lastHeadlines);
        this.contextMenu.updateFeedStats();
        this._saveCache();
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