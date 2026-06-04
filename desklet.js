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

imports.searchPath.unshift(
    `${DESKLET_DIR}/services`
);

const FeedParser = imports.FeedParser.FeedParser;
const CacheService = imports.CacheService.CacheService;
const CryptoService = imports.CryptoService.CryptoService;

class RSSDesklet extends Desklet.Desklet {

    constructor(metadata, deskletId) {

        super(metadata);

        this._menuManager = new PopupMenu.PopupMenuManager(this);

        this._initMetadata();
        this._initSettings(metadata, deskletId);
        this._initNetworking();
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
                "maxHeadlines",
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
        this._bindSetting("feedURLs");
        this._bindSetting("redditFeeds");

    }

    _initNetworking() {

        this._httpSession = new Soup.Session();

        this._httpSession.user_agent = "Mozilla/5.0 (X11; Linux x86_64)";

        this._httpSession.timeout = 10;

        this._cancellable = new Gio.Cancellable();

    }

    _initState() {

        this.feedParser = new FeedParser();

        this.cache = new CacheService();

        this.cryptoService = new CryptoService(
            this._httpGet.bind(this),
            this.cache
        );

        this.offset = 0;

        this.isPaused = false;

        this.fontParts = this._getFontParts();

        this.cryptoData = [];

        this.usingCachedData = false;

        this._loops = {};

        this.cryptoSymbolMap = {};

        this.fadeWidth = 100;

    }

    _initUI() {

        this.actor.style_class = "rss-root";

        this.container = this._createActor(St.BoxLayout, {
            reactive: true,
            clip_to_allocation: true,
            vertical: false
        });

        this.headlineButton = this._createActor(St.BoxLayout, {
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

        this._setCenter(this.cacheLabel);

        this.cacheLabel.hide();

        this.container.add_actor(this.cacheLabel);

        this.tickerViewport = this._createActor(St.Widget, {
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true
        });

        this.tickerContainer = this._createActor(St.Widget, {
            layout_manager: new Clutter.FixedLayout()
        });

        this.tickerBox1 = this._createActor(St.BoxLayout, {
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

        this._setCenter(this.emptyLabel);

        this.emptyLabel.hide();

        this.tickerViewport.add_actor(
            this.emptyLabel
        );

        this.leftFade = this._createActor(St.Widget, {
            reactive: false
        });

        this.tickerContainer.add_actor(this.leftFade);
        this.headlineButton.add_actor(this.leftFade);

        this.rightFade = this._createActor(St.Widget, {
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

    _updateLastRefreshTime() {

        this.lastRefreshTime = new Date();

        if (!this.lastRefreshMenuItem)
            return;

        this.lastRefreshMenuItem.label.text =
            "Last Refresh: " +
            this.lastRefreshTime.toLocaleString();
    }

    _setCenter(actor) {
        actor.x_align = Clutter.ActorAlign.CENTER;
        actor.y_align = Clutter.ActorAlign.CENTER;
    }

    _setNoExpand(actor) {

        actor.x_expand = false;
        actor.y_expand = false;
    }

    _appendStyle(actor, style) {

        const current =
            actor.get_style() || "";

        actor.set_style(current + style);
    }

    _setFixedWidth(actor, width) {

        this._appendStyle(actor, `
            min-width: ${width}px;
            max-width: ${width}px;
        `);
    }

    _parseRGB(color) {

        const match = (color || "").match(
            /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/
        );

        if (!match) {
            return { r: 0, g: 0, b: 0 };
        }

        return {
            r: parseInt(match[1]),
            g: parseInt(match[2]),
            b: parseInt(match[3])
        };
    }

    _clamp(value, min, max, fallback = min) {

        value = parseFloat(value);

        if (isNaN(value))
            value = fallback;

        return Math.min(max, Math.max(min, value));
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

        this._setCenter(sep);

        return sep;
    }

    _createActor(Type, props = {}) {
        return new Type({
            x_expand: false,
            y_expand: false,
            ...props
        });
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

    _addLoop(name, interval, callback, seconds = false) {

        this._removeLoop(name);

        const id = seconds
            ? Mainloop.timeout_add_seconds(
                interval,
                callback
            )
            : Mainloop.timeout_add(
                interval,
                callback
            );

        this._loops[name] = id;

        return id;
    }

    _removeLoop(name) {

        const id = this._loops[name];

        if (!id)
            return;

        Mainloop.source_remove(id);

        delete this._loops[name];
    }

    _clearLoops() {

        for (const name in this._loops) {

            Mainloop.source_remove(
                this._loops[name]
            );
        }

        this._loops = {};
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

            this._updateLastRefreshTime();

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

            this._updateLastRefreshTime();

            this._rebuildFromScratch();
        });

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

        this._setFixedWidth(
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

        this._setFixedWidth(
            this.container,
            this.calculatedWidth
        );

        this._setNoExpand(this.container);
    }

    _applyHeadlineButtonStyle() {

        this.headlineButton.style_class =
            "rss-headline-button";

        this._setFixedWidth(
            this.headlineButton,
            this.calculatedWidth
        );

        this._setNoExpand(this.headlineButton);
    }

    _applyViewportStyle() {

        if (!this.tickerViewport)
            return;

        this._setFixedWidth(
            this.tickerViewport,
            this.calculatedWidth
        );

        this.tickerViewport.width =
            this.calculatedWidth;

        this.tickerViewport.height =
            this.tickerHeight;

        this._setNoExpand(this.tickerViewport);
    }

    _applyTickerStyle() {

        this.tickerContainer.height =
            this.tickerHeight;

        this._setNoExpand(this.tickerContainer);

        this.tickerBox1.height =
            this.tickerHeight;

        this.tickerBox1.x_expand = false;

        this._setCenter(this.tickerBox1);
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

        this._rebuildTickerActors(
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
                this._clamp(
                    this.backgroundOpacity,
                    0,
                    1,
                    0.5
                );

            this.textOpacity =
                this._clamp(
                    this.textOpacity,
                    0,
                    1,
                    1.0
                );

            this.fontParts =
                this._getFontParts();

            this._calculateDimensions();

            const { r, g, b } =
                this._parseRGB(
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

    _request(url, callback) {

        try {

            const message = Soup.Message.new(
                "GET",
                url
            );

            this._httpSession.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                this._cancellable,
                (session, result) => {

                    if (this._destroyed)
                        return;

                    try {

                        const bytes =
                            session.send_and_read_finish(result);

                        const status =
                            message.get_status();

                        if (status !== Soup.Status.OK) {

                            global.log(
                                `HTTP ${status}: ${url}`
                            );

                            callback(null);

                            return;
                        }

                        callback(bytes);

                    } catch (e) {

                        global.logError(e);

                        callback(null);
                    }
                }
            );

        } catch (e) {

            global.logError(e);

            callback(null);
        }
    }

    _httpGet(url, callback) {

        this._request(url, bytes => {

            if (!bytes) {

                callback(null);

                return;
            }

            const data =
                new TextDecoder().decode(
                    bytes.get_data()
                );

            callback(data);
        });
    }

    _downloadFile(url, path) {

        this._request(url, bytes => {

            if (!bytes)
                return;

            GLib.file_set_contents(
                path,
                bytes.get_data()
            );
        });
    }

    _rebuildTickerActors(headlines) {

        this._buildTickerContent(headlines, this.tickerBox1);

        this.tickerWidth =
            this.tickerBox1.get_preferred_width(-1)[1];

        this.tickerBox1.queue_relayout();

        if (this.tickerClone)
            this.tickerClone.queue_relayout();
    }

    _buildTickerContent(headlines, targetBox) {

        if (
            this._destroyed ||
            !this.tickerBox1 ||
            !this.tickerContainer
        ) {
            return;
        }

        this._destroyChildrenSafely(targetBox);

        targetBox.x_expand = false;
        targetBox.y_expand = false;

        this._buildCryptoTicker(targetBox);

        this._buildNewsTicker(headlines, targetBox);

        targetBox.queue_relayout();
    }

    _buildCryptoTicker(targetBox) {

        if (
            !this.showCrypto ||
            !this.cryptoData ||
            this.cryptoData.length === 0
        ) {
            return;
        }

        const repeatCount = this._hasNewsFeeds() ? 1 : 6;


        for (let r = 0; r < repeatCount; r++) {

            for (const coin of this.cryptoData) {

                targetBox.add_actor(
                    this._createCryptoRow(coin)
                );

                targetBox.add_actor(
                    this._createSpacer("sep")
                );
            }
        }
    }

    _createCryptoRow(coin) {

        const isUp = coin.change >= 0;

        const color =
            isUp ? "#00dd66" : "#ff4444";

        const cryptoRow = this._createActor(St.BoxLayout, {
            vertical: false
        });

        this._setCenter(cryptoRow);

        const mainLabel = this._createLabel(
            `${coin.symbol} : ${coin.currencySymbol}${coin.price}`
        );

        this._setCenter(mainLabel);

        cryptoRow.add_actor(mainLabel);

        const spacer = this._createSpacer();

        this._setCenter(spacer);

        cryptoRow.add_actor(spacer);

        const changeLabel = this._createLabel(
            `${coin.arrow} ${coin.changeText}%`,
            color
        );

        this._setCenter(changeLabel);

        cryptoRow.add_actor(changeLabel);

        return cryptoRow;
    }

    _buildNewsTicker(headlines, targetBox) {

        if (
            !this._hasNewsFeeds() ||
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
                this._createSpacer("sep")
            );
        }

    }

    _createNewsButton(headline) {

        const btn = new St.Button({
            reactive: true,
            can_focus: true,
            track_hover: true
        });

        btn.style_class = "rss-news-button";

        const row = this._createActor(St.BoxLayout, {
            vertical: false
        });

        // =====================================
        // FAVICON
        // =====================================

        const isReddit =
            headline.isReddit === true;

        const showIcon =
            isReddit
                ? this.showRedditIcons
                : this.showFavicons;

        if (showIcon && headline.domain) {

            const icon = this._createFavicon(
                headline.domain
            );

            if (icon)
                row.add_actor(icon);
        }

        // =====================================
        // HEADLINE LABEL
        // =====================================

        const label = this._createLabel(
            headline.title || ""
        );

        row.add_actor(label);

        // =====================================
        // HOVER HANDLER
        // =====================================

        // Save original style
        label._normalStyle = `
            ${this._getFontCSS()}
            color: ${this.fontColor};
        `;

        // Hover style
        label._hoverStyle = `
            ${this._getFontCSS()}
            text-decoration: underline;
            color: ${this.fontColor};
        `;

        // Mouse enter
        btn.connect("enter-event", () => {
            label.set_style(label._hoverStyle);
        });

        // Mouse leave
        btn.connect("leave-event", () => {
            label.set_style(label._normalStyle);
        });

        btn.add_actor(row);

        // =====================================
        // CLICK HANDLER
        // =====================================

        btn._url = headline.link;

        btn._signalIds = [];

        btn._signalIds.push(
            btn.connect("clicked", actor => {

                const url = actor._url;

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
            })
        );

        return btn;
    }

    _createFavicon(domain) {

        const iconPath =
            this._getFaviconPath(domain);

        if (
            !GLib.file_test(
                iconPath,
                GLib.FileTest.EXISTS
            )
        ) {
            return null;
        }

        try {

            const file =
                Gio.file_new_for_path(iconPath);

            const gicon =
                Gio.FileIcon.new(file);

            const icon = new St.Icon({
                gicon,
                icon_size: this.fontParts.size
            });

            icon.set_style(`
                margin-right: 10px;
            `);

            return icon;

        } catch (e) {

            global.logError(e);

            return null;
        }
    }

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

        this._downloadFile(url, path);
    }

    _reload() {

        this.lastHeadlines = [];
        this._fetchFeeds();
    }

    _fetchFeeds() {

        this._updateLastRefreshTime();

        let feeds = this._getFeedList();

        // =====================================
        // NO NEWS FEEDS
        // =====================================

        if (!feeds.length) {

            if (this.showCrypto) {

                this._hideEmptyMessage();

                this.lastHeadlines = [];

                this._rebuildTickerActors([]);

            } else {

                this._showEmptyMessage(
                    "No Feeds Configured"
                );
            }

            return;
        }

        let pending = feeds.length;

        let allHeadlines = [];

        feeds.forEach(feedURL => {

            this._httpGet(feedURL, stdout => {

            if (!stdout) {

                pending--;

                // If ALL feeds failed and we already have cache,
                // keep the cached headlines instead of clearing UI
                if (pending <= 0) {

                    if (allHeadlines.length > 0) {

                        this._finalizeHeadlines(allHeadlines);

                    } else if (this.lastHeadlines &&
                               this.lastHeadlines.length > 0) {

                        global.log("Using cached RSS headlines");

                        this.usingCachedData = true;
                        this._updateCacheIndicator();

                        this._rebuildTickerActors(this.lastHeadlines);

                    } else {

                        this._finalizeHeadlines([]);
                    }
                }

                return;
            }

                try {

                    let items =
                        this.feedParser.parse(
                            stdout,
                            feedURL,
                            {
                                allowNSFW: this.AllowNSFW,
                                showSource: this.showSource,
                                showRedditSource: this.showRedditSource
                            }
                        );

                    allHeadlines =
                        allHeadlines.concat(items);

                } catch (e) {

                    global.logError(e);
                }

                pending--;

                if (pending <= 0)
                    this._finalizeHeadlines(allHeadlines);
            });

        });
    }

    _finalizeHeadlines(headlines) {

        if (headlines.length > 0 || this.showCrypto) {
            this._hideEmptyMessage();
        }

        this.usingCachedData = false;
        this._updateCacheIndicator();

        let seen = {};

        headlines = headlines.filter(h => {

            if (seen[h.link])
                return false;

            seen[h.link] = true;

            return true;
        });

        if (this.randomise) {

            for (let i = headlines.length - 1; i > 0; i--) {

                let j = Math.floor(Math.random() * (i + 1));

                [headlines[i], headlines[j]] = [
                    headlines[j],
                    headlines[i]
                ];
            }
        }

        let max = this.maxHeadlines || 20;

        headlines = headlines.slice(0, max);

        if (!headlines.length) {

        if (this.showCrypto &&
            this.cryptoData &&
            this.cryptoData.length > 0) {

            this._hideEmptyMessage();

            this.lastHeadlines = [];

            this._rebuildTickerActors([]);

            return;
        }

        this._showEmptyMessage(
            "No Headlines Available"
        );

        return;
    }

        const existing = this.lastHeadlines || [];

        const existingLinks = new Set(
            existing.map(h => h.link)
        );

        const newItems = headlines.filter(
            h => !existingLinks.has(h.link)
        );

        if (newItems.length === 0) {

            global.log(
                "No new headlines found"
            );

            return;
        }

        this.lastHeadlines =
            existing.concat(newItems);

        const maxBuffer = 100;

        if (this.lastHeadlines.length > maxBuffer) {

            this.lastHeadlines =
                this.lastHeadlines.slice(-maxBuffer);
        }

        this._rebuildTickerActors(
            this.lastHeadlines
        );

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

                this._rebuildTickerActors(
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

        this._addLoop(
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

        this._removeLoop("crypto");
    }

    _startRedditRefresh() {

        const interval =
            Math.max(
                1,
                this.redditRefreshInterval || 10
            ) * 60;

        this._addLoop(
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
        this._removeLoop("reddit");
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

        this._addLoop(
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

        this._removeLoop("ticker");
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

        this._addLoop(
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

        this._removeLoop("refresh");
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

        this._rebuildTickerActors(
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

        this._clearLoops();

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