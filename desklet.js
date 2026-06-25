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

        [
            "showRSS",
            "maxHeadlines",
            "showSource",
            "randomise",
            "showFavicons",
            "headlineMaxLength",
            "enableReddit",
            "maxRedditHeadlines",
            "showRedditSource",
            "showRedditIcons",
            "allowNSFW",
            "redditSort",
            "showCrypto",
            "showCryptoIcons"
        ].forEach(k => this._bindSetting(k, this._reload));

        [
            "backgroundOpacity",
            "backgroundColor",
            "deskletWidth",
            "deskletHeight",
            "fontFamily",
            "fontColor",
            "textOpacity",
            "enableFade"
        ].forEach(k => this._bindSetting(k, this._applyStyle));

        [
            "speed",
            "scrollReverse"
        ].forEach(k => this._bindSetting(k, this._startTicker));

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

        this._httpSession.user_agent =
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

        this._httpSession.timeout = 10;

        this._cancellable = new Gio.Cancellable();
    }

    _initState() {

        this.offset = 0;

        this.isPaused = false;

        this.fontParts = this._getFontParts();

        this.cryptoData = [];

        this.usingCachedData = false;

        this._lastGoodRedditHeadlines = [];

        this._loops = {};

        this.cryptoSymbolMap = {};

        this.fadeWidth = 100;
    }

    _initUI() {

        this.actor.style_class = "rss-root";

        this.container = this._createBox({
            reactive: true,
            clip_to_allocation: true,
            vertical: false
        });

        this.headlineButton = this._createBox({
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

        this.cacheLabel.y_align = Clutter.ActorAlign.CENTER;
        this.cacheLabel.x_align = Clutter.ActorAlign.CENTER;

        this.cacheLabel.hide();

        this.container.add_actor(this.cacheLabel);

        this.tickerViewport = this._createWidget({
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true
        });

        this.tickerContainer = this._createWidget({
            layout_manager: new Clutter.FixedLayout()
        });

        this.tickerBox1 = this._createBox({
            reactive: true
        });

        this.tickerClone = new Clutter.Clone({
            source: this.tickerBox1,
            reactive: false
        });

        this.tickerContainer.add_actor(this.tickerBox1);
        this.tickerContainer.add_actor(this.tickerClone);

        this.tickerViewport.add_actor(this.tickerContainer);

        this.leftFade = this._createWidget({
            reactive: false
        });

        this.tickerContainer.add_actor(this.leftFade);
        this.headlineButton.add_actor(this.leftFade);

        this.rightFade = this._createWidget({
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

        this.headlineButton.connect(
            "scroll-event",
            (actor, event) => {

                const dir = event.get_scroll_direction();

                if (dir === Clutter.ScrollDirection.UP)
                    this.offset -= 50;

                else if (dir === Clutter.ScrollDirection.DOWN)
                    this.offset += 50;

                this._updateTickerPosition();

                return Clutter.EVENT_STOP;
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

    // --UI HELPERS

    _updateTickerPosition() {

        const width1 = this.tickerWidth || 0;

        if (width1 <= 0)
            return;

        while (this.offset < 0)
            this.offset += width1;

        while (this.offset >= width1)
            this.offset -= width1;

        this.tickerBox1.set_position(
            -this.offset,
            0
        );

        this.tickerClone.set_position(
            width1 - this.offset,
            0
        );
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

    // --ACTOR / WIDGET HELPERS

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

    _createBox(props = {}) {

        return new St.BoxLayout({
            x_expand: false,
            y_expand: false,
            ...props
        });
    }

    _createWidget(props = {}) {

        return new St.Widget({
            x_expand: false,
            y_expand: false,
            ...props
        });
    }

    _shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // --LABELS & TEXT

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
            font-family: "${this.fontParts.family}";
            font-size: ${this.fontParts.size}px;
            font-weight: ${this.fontParts.weight};
            font-style: ${this.fontParts.style};
            color: ${color || this.fontColor};

            ${extraStyle}
        `);

        label.opacity =
            Math.floor(this.textOpacity * 255);

        return label;
    }

    _truncateHeadline(text) {

        const max =
            parseInt(this.headlineMaxLength) || 0;

        if (
            max <= 0 ||
            !text ||
            text.length <= max
        ) {
            return text;
        }

        const limit = max - 1;

        let truncated =
            text.substring(0, limit);

        const lastSpace =
            truncated.lastIndexOf(" ");

        if (lastSpace > limit * 0.5) {

            truncated =
                truncated.substring(0, lastSpace);
        }

        return truncated.trimEnd() + "…";
    }

    _cleanText(text) {

        if (!text)
            return "";

        text = text
            .replace(/<!\[CDATA\[/g, "")
            .replace(/\]\]>/g, "")
            .replace(/<[^>]*>/g, "");

        text = this._decodeEntities(text);

        return text
            .replace(/\s+/g, " ")
            .trim();
    }

    _formatHeadline(source, title, isReddit = false) {

        // REDDIT
        if (isReddit) {

            if (!this.showRedditSource)
                return title;
        }

        // RSS
        else {

            if (!this.showSource)
                return title;
        }

        return `【${source}】 ${title}`;
    }

    _decodeEntities(text) {

        if (!text)
            return "";

        try {

            const label = new St.Label();

            // Wrap in harmless span
            label.clutter_text.set_markup(
                `<span>${text}</span>`
            );

            return label.clutter_text.text;

        } catch (e) {

            return text
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, "\"")
                .replace(/&#39;/g, "'")
                .replace(/&#x27;/gi, "'")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">");
        }
    }

    // --DATA & FILE HELPERS

    _readJSON(path) {

        try {

            if (!GLib.file_test(path, GLib.FileTest.EXISTS))
                return null;

            const [success, contents] =
                GLib.file_get_contents(path);

            if (!success || !contents)
                return null;

            return JSON.parse(contents.toString());

        } catch (e) {

            global.logError(e);

            return null;
        }
    }

    _writeJSON(path, data) {

        try {

            GLib.file_set_contents(
                path,
                JSON.stringify(data)
            );

        } catch (e) {

            global.logError(e);
        }
    }

    _getCacheDir() {
        let dir = GLib.build_filenamev([
            GLib.get_user_cache_dir(),
            "rss-desklet"
        ]);

        GLib.mkdir_with_parents(dir, 0o755);

        return dir;
    }

    _clamp(value, min, max, fallback = min) {

        value = parseFloat(value);

        if (isNaN(value))
            value = fallback;

        return Math.min(max, Math.max(min, value));
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

    // --TIMER / LOOP MANAGEMENT

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

    // --RSS / REDDIT HELPERS

    _getFeedList() {

        let feeds = [];

        if (
            this.showRSS &&
            this.feedURLs
        ) {

            const rssFeeds =
                this.feedURLs
                    .split("\n")
                    .map(u => u.trim())
                    .filter(u => u.length > 0);

            feeds = feeds.concat(rssFeeds);
        }

        if (this.enableReddit) {

            const redditFeeds =
                this._getRedditFeedList();

            feeds = feeds.concat(redditFeeds);
        }

        return feeds;
    }

    _getRedditFeedList() {

        if (!this.enableReddit)
            return [];

        const trimmed =
            (this.redditFeeds || "").trim();

        if (!trimmed)
            return this._lastValidRedditFeeds || [];

        const sort =
            this.redditSort || "hot";

        const feeds = trimmed
            .split("\n")
            .map(s => s.trim())
            .filter(Boolean)
            .map(sub =>
                `https://www.reddit.com/r/${sub}/${sort}.rss`
            );

        this._lastValidRedditFeeds = feeds;

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

    _extractOver18(itemXML) {

        return /<category[^>]+(?:term|label)=["'](?:over18|nsfw)["']/i
            .test(itemXML);
    }

    // --CONTEXT MENU

    _buildMenuItem(label, icon, callback) {

        const item = new PopupMenu.PopupIconMenuItem(
            label,
            icon,
            St.IconType.SYMBOLIC
        );

        item.connect("activate", callback);
        return item;
    }

    _addContextMenu() {

        this._menu = new PopupMenu.PopupMenu(
            this.actor,
            0.0,
            St.Side.TOP
        );

        Main.uiGroup.add_actor(this._menu.actor);

        this._menu.actor.hide();

        this._menuManager.addMenu(this._menu);

        // Refresh Feeds
        const refreshItem =
            new PopupMenu.PopupIconMenuItem(
                "Refresh All Feeds",
                "view-refresh-symbolic",
                St.IconType.SYMBOLIC
            );

        refreshItem.connect("activate", () => {

            Main.notify(
                "Scrolling RSS, Reddit & Crypto Ticker",
                "Refreshing Feeds..."
            );

            this._updateLastRefreshTime();

            this._fetchCrypto();
            this._fetchFeeds();
        });

        this._menu.addMenuItem(refreshItem);

        const refreshAllItem =
            new PopupMenu.PopupIconMenuItem(
                "Remove & Refresh All Feeds",
                "edit-delete",
                St.IconType.SYMBOLIC
            );

        refreshAllItem.connect(
            "activate",
            () => {

                Main.notify(
                    "Scrolling RSS, Reddit & Crypto Ticker",
                    "Removing & Refreshing Feeds..."
                );

                Mainloop.idle_add(() => {

                    this._rebuildFromScratch();

                    return false;
                });
            }
        );

        this._menu.addMenuItem(
            refreshAllItem
        );

        // Separator
        this._menu.addMenuItem(
            new PopupMenu.PopupSeparatorMenuItem()
        );

        // Last Refresh Time
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

        this.feedStatsMenuItem =
            new PopupMenu.PopupMenuItem(
                "Feeds: ..."
            );

        this.feedStatsMenuItem.setSensitive(false);

        this.feedStatsMenuItem.label.set_style(`
            color: white;
            font-size: 9pt;
            font-family: monospace;
        `);

        this._menu.addMenuItem(
            this.feedStatsMenuItem
        );
    }

    _updateFeedStats() {

        if (!this.feedStatsMenuItem)
            return;

        const rssSources =
            this.feedURLs
                ? this.feedURLs
                    .split("\n")
                    .filter(Boolean)
                    .length
                : 0;

        const redditSources =
            this.redditFeeds
                ? this.redditFeeds
                    .split("\n")
                    .filter(Boolean)
                    .length
                : 0;

        const stats =
            this.feedStats || {};

        const pad =
            (str, len) =>
                String(str).padEnd(len);

        this.feedStatsMenuItem.label.text =
            `${pad("Sources",12)} RSS ${pad(rssSources,5)} Reddit ${redditSources}\n` +
            `${pad("Retrieved",12)} RSS ${pad(stats.rssRetrieved || 0,5)} Reddit ${stats.redditRetrieved || 0}\n` +
            `${pad("Displayed",12)} RSS ${pad(stats.rssDisplayed || 0,5)} Reddit ${stats.redditDisplayed || 0}`;
    }

    // --STYLING & LAYOUT

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

        sep.y_align = Clutter.ActorAlign.CENTER;

        return sep;
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

        this.tickerBox1.set_x_align(
            Clutter.ActorAlign.START
        );
    }

    _applyFadeStyle(r, g, b, bgOpacity) {

        if (!this.enableFade) {

            this.leftFade.hide();
            this.rightFade.hide();

            return;
        }

        const fadeRGBA =
            `rgba(${r}, ${g}, ${b}, ${bgOpacity})`;

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

    // --NETWORKING

    _request(url, callback) {

        try {

            const message = Soup.Message.new(
                "GET",
                url
            );

            message.request_headers.append(
                "User-Agent",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
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
                            message.status_code;

                        global.log(
                            `[RSSDesklet] HTTP ${status} ${url}`
                        );

                        if (status !== 200) {

                            callback(null);
                            return;
                        }

                        if (status !== Soup.Status.OK) {

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

    // --TICKER BUILDING

    _rebuildFromScratch() {

        this.lastHeadlines = [];

        this._destroyChildrenSafely(
            this.tickerBox1
        );

        this.cryptoData = [];

        this.offset = 0;

        this._fetchCrypto();
        this._fetchFeeds();
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

        if (this._destroyed || !targetBox) return;

        this._destroyChildrenSafely(targetBox);

        this._buildCryptoTicker(targetBox);

        if (headlines && headlines.length > 0) {
            this._buildNewsTicker(headlines, targetBox);
        }

        targetBox.queue_relayout();
    }

    // --CRYPTO TICKER UI

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

        const cryptoRow = this._createBox({
            vertical: false,
            y_align: Clutter.ActorAlign.CENTER
        });

        let icon = null;

        if (this.showCryptoIcons) {

            const icon =
                this._createCryptoIcon(coin.id);

            if (icon)
                cryptoRow.add_actor(icon);
        }

        const mainLabel = this._createLabel(
            `${coin.symbol} : ${coin.currencySymbol}${coin.price}`
        );

        mainLabel.y_align = Clutter.ActorAlign.CENTER;

        cryptoRow.add_actor(mainLabel);

        const spacer = this._createSpacer();

        spacer.y_align = Clutter.ActorAlign.CENTER;

        cryptoRow.add_actor(spacer);

        const changeLabel = this._createLabel(
            `${coin.arrow} ${coin.changeText}%`,
            color
        );

        changeLabel.y_align = Clutter.ActorAlign.CENTER;

        cryptoRow.add_actor(changeLabel);

        return cryptoRow;
    }

    _createCryptoIcon(id) {

        const path =
            this._getCryptoIconPath(id);

        if (
            !GLib.file_test(
                path,
                GLib.FileTest.EXISTS
            )
        ) {
            return null;
        }

        try {

            const file =
                Gio.file_new_for_path(path);

            const gicon =
                Gio.FileIcon.new(file);

            const icon =
                new St.Icon({
                    gicon,
                    icon_size: this.fontParts.size
                });

            icon.set_style(`
                margin-right: 8px;
            `);

            return icon;

        } catch (e) {

            global.logError(e);
            return null;
        }
    }

    // --NEWS TICKER UI

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

        const row = this._createBox({
            vertical: false
        });

        const source = this._extractSource(headline.link || "");
        const isReddit = headline.source === "reddit";

        const icon = this._getIconForHeadline(headline);

        if (icon)
            row.add_actor(icon);

        const rawTitle = headline.title || "";

        const cleanTitle =
            rawTitle.replace(/^【.*?】\s*/, "");

        const truncatedTitle =
            this._truncateHeadline(cleanTitle);

        const formattedTitle =
            this._formatHeadline(
                source,
                truncatedTitle,
                isReddit
            );

        const label = this._createLabel(formattedTitle);

        row.add_actor(label);

        // Save original style
        label._normalStyle = `
            font-family: "${this.fontParts.family}";
            font-size: ${this.fontParts.size}px;
            font-weight: ${this.fontParts.weight};
            font-style: ${this.fontParts.style};
            color: ${this.fontColor};
        `;

        // Hover style
        label._hoverStyle = `
            font-family: "${this.fontParts.family}";
            font-size: ${this.fontParts.size}px;
            font-weight: ${this.fontParts.weight};
            font-style: ${this.fontParts.style};
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

        // CLICK HANDLER

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

    _getIconForHeadline(headline) {

        const isReddit = headline.source === "reddit";

        // RSS ICONS
        if (!isReddit) {

            if (!this.showFavicons)
                return null;

            if (!headline.domain)
                return null;

            return this._createFavicon(headline.domain);
        }

        // REDDIT ICONS
        if (isReddit) {

            if (!this.showRedditIcons)
                return null;

            return this._createFavicon("reddit.com");
        }

        return null;
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

    // --FAVICON MANAGEMENT

    _getFaviconDir() {

        let dir = GLib.build_filenamev([
            this._getCacheDir(),
            "rss-desklet-icons"
        ]);

        GLib.mkdir_with_parents(dir, 0o755);

        return dir;
    }

    _getDomain(url) {

        let match =
            url.match(/^https?:\/\/([^\/]+)/i);

        return match
            ? match[1].replace(/^www\./, "")
            : null;
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

    // --RSS / REDDIT FETCHING

    _reload() {

        if (!this.enableReddit)
            this._lastGoodRedditHeadlines = [];

        if (this._reloadTimer)
            Mainloop.source_remove(this._reloadTimer);

        this._reloadTimer =
            Mainloop.timeout_add(
                500,
                () => {

                    this._fetchFeeds();

                    this._reloadTimer = null;

                    return false;
                }
            );
    }

    _fetchFeeds() {

        // Prevent stale async refreshes
        if (!this._feedFetchId)
            this._feedFetchId = 0;

        const fetchId =
            ++this._feedFetchId;

        this.usingCachedData = false;

        this._updateCacheIndicator();

        this._buildingFeeds = true;

        this._updateLastRefreshTime();

        const feeds =
            this._getFeedList();

        // No feeds configured
        if (!feeds.length) {

            if (fetchId !== this._feedFetchId)
                return;

            if (this.showCrypto) {

                this.lastHeadlines = [];

                this._rebuildTickerActors([]);

                this._buildingFeeds = false;

                return;
            }

            this._destroyChildrenSafely(
                this.tickerBox1
            );

            this.tickerBox1.add_actor(
                new St.Label({
                    text: "No feeds configured"
                })
            );

            this._buildingFeeds = false;

            return;
        }

        // Fetch state
        const state = {

            rssAll: [],
            redditAll: [],

            pending: feeds.length,

            done: false
        };

        // Fetch feeds
        const REDDIT_DELAY_MS = 1200;

        feeds.forEach((feedURL, index) => {

            const delay =
                /reddit\.com/i.test(feedURL)
                    ? index * REDDIT_DELAY_MS
                    : 0;

            Mainloop.timeout_add(delay, () => {

                this._httpGet(feedURL, stdout => {

                    const isReddit =
                        /reddit\.com/i.test(feedURL);

                    if (!stdout) {

                    } else {

                        try {

                            const items =
                                this._parseRSS(
                                    stdout,
                                    feedURL
                                );
                            global.log(
                                `[RSSDesklet] ${feedURL} -> ${items.length} items`
                            );

                            if (isReddit)
                                state.redditAll.push(...items);
                            else
                                state.rssAll.push(...items);

                        } catch (e) {

                            global.logError(e);
                        }
                    }

                    state.pending--;

                        if (
                            state.pending === 0 &&
                            !state.done
                        ) {

                            state.done = true;

                            if (
                                fetchId !== this._feedFetchId
                            ) {
                                return;
                            }

                            global.log(
                                `[RSSDesklet] Fetch Complete #${fetchId} RSS=${state.rssAll.length} Reddit=${state.redditAll.length}`
                            );

                            this._finalizeHeadlines(
                                state.rssAll,
                                state.redditAll
                            );
                        }
                    }
                );
                return false;
            });
        });
    }

    _finalizeHeadlines(rssHeadlines = [], redditHeadlines = []) {

        const dedupe = (arr) => {
            const seen = {};
            return arr.filter(h => {
                if (!h || seen[h.link]) return false;
                seen[h.link] = true;
                return true;
            });
        };

        const shuffle = (arr) => {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        };

        const rssEnabled =
            this.showRSS &&
            this.feedURLs &&
            this.feedURLs.trim().length > 0;

        const redditEnabled =
            this.enableReddit &&
            this.redditFeeds &&
            this.redditFeeds.trim().length > 0;

        const rssClean =
            dedupe(rssHeadlines);

        let redditClean =
            dedupe(redditHeadlines);

        if (redditEnabled) {

            if (redditClean.length > 0) {

                this._lastGoodRedditHeadlines =
                    [...redditClean];

            } else if (
                this._lastGoodRedditHeadlines &&
                this._lastGoodRedditHeadlines.length > 0
            ) {

                global.log(
                    "[RSSDesklet] Using cached Reddit headlines"
                );

                redditClean =
                    [...this._lastGoodRedditHeadlines];
            }

        } else {

            redditClean = [];
        }

        const rssMax =
            this.maxHeadlines || 20;

        const redditMax =
            this.maxRedditHeadlines || 10;

        const finalRSS =
            shuffle([...rssClean]).slice(0, rssMax);

        const finalReddit =
            shuffle([...redditClean]).slice(0, redditMax);

        const merged = shuffle([...finalRSS, ...finalReddit]);

        if (
            rssClean.length === 0 &&
            redditClean.length === 0
        ) {

            const cache =
                this._readJSON(this._getCacheFile());

            if (
                cache &&
                Array.isArray(cache.headlines) &&
                cache.headlines.length > 0
            ) {

                global.log(
                    "[RSSDesklet] Using disk cached headlines"
                );

                this.usingCachedData = true;
                this._updateCacheIndicator();

                const filteredCache =
                    cache.headlines.filter(h => {

                        if (h.source === "reddit")
                            return redditEnabled;

                        return rssEnabled;
                    });

                this.lastHeadlines = filteredCache;

                this._rebuildTickerActors(
                    filteredCache
                );

                this._buildingFeeds = false;

                return;
            }
        }

        global.log(
            `[RSSDesklet] rssEnabled=${rssEnabled} redditEnabled=${redditEnabled} rssClean=${rssClean.length} redditClean=${redditClean.length}`
        );

        if (merged.length === 0) {
            this._destroyChildrenSafely(this.tickerBox1);
            this.tickerBox1.add_actor(new St.Label({ text: "No headlines" }));
            this.lastHeadlines = [];
            this._buildingFeeds = false;
            return;
        }

        this.feedStats = {

            rssRetrieved:
                rssHeadlines.length,

            redditRetrieved:
                redditHeadlines.length,

            rssDisplayed:
                finalRSS.length,

            redditDisplayed:
                finalReddit.length
        };

        this._updateFeedStats();

        this.lastHeadlines = merged;
        this._rebuildTickerActors(merged);
        this._updateFeedStats();
        this._saveCache();

        this._buildingFeeds = false;
    }

    // --RSS PARSING

    _parseRSS(xml, feedURL) {

        const items = [];

        const source =
            this._extractSource(feedURL);

        global.log(
            `[RSSDesklet] Parsed ${items.length} items from ${source}`
        );

        const rssItems =
            this._extractRSSItems(xml);

        for (const itemXML of rssItems) {

            const title =
                this._extractTitle(itemXML);

            const link =
                this._extractLink(itemXML);

            if (!title || !link)
                continue;

            const cleanTitle =
                this._cleanText(title);

            const cleanLink =
                this._cleanText(link)
                    .replace(/\s+/g, "");

            const isNSFW =
                this._extractOver18(itemXML);

            if (isNSFW && !this.allowNSFW)
                continue;

            const isReddit =
                feedURL.includes("/r/") &&
                feedURL.includes("reddit");

            const displayTitle =
                this._formatHeadline(
                    source,
                    cleanTitle,
                    isReddit
                );

            const domain =
                this._getDomain(cleanLink);

            if (this.showFavicons)
                this._fetchFavicon(domain);

            items.push({
                title: cleanTitle,
                link: cleanLink,
                domain,
                source: isReddit ? "reddit" : "rss"
            });
        }

        const isReddit =
            feedURL.includes("/r/") &&
            feedURL.includes("reddit");

        if (isReddit) {

            const max =
                this.maxRedditHeadlines || 10;

            return items.slice(0, max);
        }

        return items;
    }

    _extractRSSItems(xml) {

        let items = [];

        // RSS 2.0 (BBC etc.)
        const rssMatches = xml.match(/<item[\s\S]*?<\/item>/g);

        if (rssMatches && rssMatches.length) {
            return rssMatches;
        }

        // Atom (Reddit etc.)
        const atomMatches = xml.match(/<entry[\s\S]*?<\/entry>/g);

        if (atomMatches && atomMatches.length) {
            return atomMatches;
        }

        return [];
    }

    _extractTitle(itemXML) {

        // RSS
        let match =
            itemXML.match(
                /<title>([\s\S]*?)<\/title>/i
            );

        // ATOM (Reddit)
        if (!match) {

            match =
                itemXML.match(
                    /<title[^>]*>([\s\S]*?)<\/title>/i
                );
        }

        return match
            ? match[1]
            : null;
    }

    _extractLink(itemXML) {

        // RSS LINK

        let match =
            itemXML.match(
                /<link>([\s\S]*?)<\/link>/i
            );

        if (match)
            return match[1];

        // ATOM LINK

        match =
            itemXML.match(
                /<link[^>]+href=["']([^"']+)["']/i
            );

        if (match)
            return match[1];

        // GUID FALLBACK

        match =
            itemXML.match(
                /<guid[^>]*>([\s\S]*?)<\/guid>/i
            );

        return match
            ? match[1]
            : null;
    }
    
    _extractSource(url) {

        // Reddit special handling
        const reddit =
            url.match(/reddit\.com\/r\/([^\/]+)/i);

        if (reddit)
            return `r/${reddit[1]}`;

        let m =
            url.match(/https?:\/\/(?:www\.)?([^\/]+)/i);

        if (!m)
            return "RSS";

        return m[1]
            .replace(/\.(com|org|net)$/i, "")
            .toUpperCase();
    }

    // --CRYPTO DATA FETCHING

    _fetchCrypto() {

        if (!this.showCrypto) {

            this._fetchFeeds();

            return;
        }

        let rawSymbols =
            this.cryptoSymbols || "bitcoin\nethereum";

        let userTokens = rawSymbols
            .split("\n")
            .map(s => s.trim().toLowerCase())
            .filter(s => s.length > 0);

        let currency =
            (this.cryptoCurrency || "usd").toLowerCase();

        // TRY CACHE FIRST

        let cachedCoinList =
            this._loadCoinListCache();

        if (cachedCoinList) {

            this._processCoinList(
                cachedCoinList,
                userTokens,
                currency
            );

            return;
        }

        // FETCH COIN LIST

        let coinListURL =
            "https://api.coingecko.com/api/v3/coins/list";

        this._httpGet(coinListURL, stdout => {

            if (!stdout)
                return;

            try {

                let coinList =
                    JSON.parse(stdout);

                this._saveCoinListCache(
                    coinList
                );

                this._processCoinList(
                    coinList,
                    userTokens,
                    currency
                );

            } catch (e) {

                global.logError(
                    "CoinGecko validation error: " + e
                );
            }
        });
    }

    _processCoinList(
        coinList,
        userTokens,
        currency
    ) {

        // BUILD LOOKUP MAPS
        let idMap = {};
        let symbolMap = {};
        let nameMap = {};
        let coinById = {};

        coinList.forEach(coin => {

            if (!coin.id)
                return;

            let id =
                coin.id.toLowerCase();

            idMap[id] = coin.id;

            coinById[coin.id] = coin;

            if (coin.symbol) {

                let symbol =
                    coin.symbol.toLowerCase();

                if (!symbolMap[symbol]) {

                    symbolMap[symbol] =
                        coin.id;
                }
            }

            if (coin.name) {

                nameMap[
                    coin.name.toLowerCase()
                ] = coin.id;
            }
        });

        // RESOLVE TOKENS
        let validIDs = [];
        let invalidTokens = [];

        this.cryptoSymbolMap = {};

        userTokens.forEach(token => {

            let resolved = null;

            // Exact ID
            if (idMap[token]) {

                resolved = idMap[token];
            }

            // Symbol
            else if (symbolMap[token]) {

                resolved = symbolMap[token];
            }

            // Name
            else if (nameMap[token]) {

                resolved = nameMap[token];
            }

            if (resolved) {

                if (!validIDs.includes(resolved)) {

                    validIDs.push(resolved);

                    let symbol =
                        token.toUpperCase();

                    let coin =
                        coinById[resolved];

                    if (
                        coin &&
                        coin.symbol
                    ) {

                        symbol =
                            coin.symbol.toUpperCase();
                    }

                    this.cryptoSymbolMap[
                        resolved
                    ] = symbol;
                }

            } else {

                invalidTokens.push(token);
            }
        });

        // INVALID TOKENS
        if (invalidTokens.length > 0) {

            global.log(
                "Invalid Crypto Tokens: " +
                invalidTokens.join(", ")
            );
        }

        // FETCH PRICES
        let url =
            "https://api.coingecko.com/api/v3/coins/markets" +
            "?vs_currency=" + currency +
            "&ids=" + encodeURIComponent(validIDs.join(",")) +
            "&price_change_percentage=24h";

            this._httpGet(url, priceStdout => {

                if (!priceStdout) {

                    if (this.cryptoData &&
                        this.cryptoData.length > 0) {

                        global.log("Using cached crypto data");

                        this._fetchFeeds();
                    }

                    return;
                }

                try {

                    let data =
                        JSON.parse(priceStdout);

                    this._parseCrypto(
                        data,
                        currency
                    );

                } catch (e) {

                    global.logError(
                        "Crypto parse error: " + e
                    );
                }
            }
        );
    }

    _getCurrencySymbol(currency) {

        const symbols = {
            usd: "$",
            aud: "A$",
            cad: "C$",
            eur: "€",
            gbp: "£",
            jpy: "¥",
            cny: "¥",
            inr: "₹",
            krw: "₩",
            rub: "₽",
            chf: "CHF",
            sek: "kr",
            nok: "kr",
            dkk: "kr",
            nzd: "NZ$",
            sgd: "S$",
            hkd: "HK$",
            brl: "R$",
            mxn: "$",
            zar: "R",
            try: "₺",
            aed: "د.إ",
            pln: "zł",
            thb: "฿",
            idr: "Rp",
            myr: "RM",
            php: "₱",
            vnd: "₫"
        };

        currency = (currency || "usd").toLowerCase();

        return symbols[currency] || currency.toUpperCase() + " ";
    }

    _parseCrypto(data, currency) {

        if (
            this._destroyed ||
            !this.tickerBox1 ||
            !this.tickerContainer
        ) {
            return;
        }

        let chunks = [];

        for (const item of data) {

            if (
                !item ||
                typeof item !== "object" ||
                item.current_price === undefined
            ) {
                continue;
            }

            // Cache logo
            if (item.image) {

                this._fetchCryptoIcon(
                    item.id,
                    item.image
                );
            }

            const price =
                item.current_price;

            const change =
                item.price_change_percentage_24h || 0;

            // SYMBOL
            const symbol =
                (item.symbol || item.id || "")
                    .toUpperCase();

            // PRICE FORMAT
            let formattedPrice;

            if (price >= 1000) {

                formattedPrice =
                    Number(price).toLocaleString(
                        undefined,
                        {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2
                        }
                    );

            } else if (price >= 1) {

                formattedPrice =
                    Number(price).toFixed(2);

            } else {

                formattedPrice =
                    Number(price).toFixed(6);
            }

            // CHANGE FORMAT
            const arrow =
                change >= 0
                    ? "▲"
                    : "▼";

            const changeText =
                Math.abs(change).toFixed(2);

            // TICKER OBJECT
            chunks.push({

                id: item.id,

                symbol: symbol,

                price: formattedPrice,

                change: change,

                arrow: arrow,

                changeText: changeText,

                currencySymbol:
                    this._getCurrencySymbol(
                        currency
                    )
            });
        }

        // NO VALID DATA
        if (chunks.length === 0) {

            global.log(
                "Crypto update ignored: no valid data"
            );

            return;
        }

        // UPDATE TICKER
        this.cryptoData = chunks;

        this._rebuildTickerActors(
            this.lastHeadlines || []
        );
    }

    // --CRYPTO ICON CACHE

    _getCryptoIconDir() {

        let dir = GLib.build_filenamev([
            this._getCacheDir(),
            "rss-desklet-icons"
        ]);

        GLib.mkdir_with_parents(dir, 0o755);

        return dir;
    }

    _getCryptoIconPath(id) {

        return GLib.build_filenamev([
            this._getCryptoIconDir(),
            id + ".png"
        ]);
    }

    _fetchCryptoIcon(id, imageUrl) {

        if (!id || !imageUrl)
            return;

        const path =
            this._getCryptoIconPath(id);

        if (
            GLib.file_test(
                path,
                GLib.FileTest.EXISTS
            )
        ) {
            return;
        }

        this._downloadFile(
            imageUrl,
            path
        );
    }

    // --CRYPTO REFRESH TIMERS

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

    // --REDDIT REFRESH TIMERS

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

    // --SETTINGS CALLBACKS

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

    // --TICKER ENGINE

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

                if (
                    !this.tickerBox1 ||
                    !this.tickerClone
                ) {
                    return true;
                }

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

                this._updateTickerPosition();

                return true;
            }
        );
    }

    _stopTicker() {

        this._removeLoop("ticker");
    }

    // --FEED REFRESH ENGINE

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

    // --CACHE MANAGEMENT

    _getCoinListCacheFile() {

        return GLib.build_filenamev([
            this._getCacheDir(),
            "rss-desklet-coins.json"
        ]);
    }

    _saveCoinListCache(data) {

        this._writeJSON(
            this._getCoinListCacheFile(),
            {
                timestamp: Date.now(),
                data
            }
        );
    }

    _loadCoinListCache() {

        const cache = this._readJSON(
            this._getCoinListCacheFile()
        );

        if (!cache?.timestamp || !cache?.data)
            return null;

        const maxAge = 24 * 60 * 60 * 1000;

        const age =
            Date.now() - cache.timestamp;

        if (age > maxAge)
            return null;

        return cache.data;
    }

    _saveCache() {

        this._writeJSON(
            this._getCacheFile(),
            {
                headlines: this.lastHeadlines || [],
                cryptoData: this.cryptoData || [],
                timestamp: Date.now()
            }
        );
    }

    _loadCache() {

        const cache = this._readJSON(
            this._getCacheFile()
        );

        if (!cache)
            return false;

        if (Array.isArray(cache.headlines)) {

            this.lastHeadlines = cache.headlines;

            this._lastGoodRSSHeadlines =
                cache.headlines.filter(
                    h => h.source === "rss"
                );

            this._lastGoodRedditHeadlines =
                cache.headlines.filter(
                    h => h.source === "reddit"
                );
        }

        if (Array.isArray(cache.cryptoData)) {
            this.cryptoData = cache.cryptoData;
        }

        this._rebuildTickerActors(
            this.lastHeadlines || []
        );

        return true;
    }

    _getCacheFile() {

        return GLib.build_filenamev([
            this._getCacheDir(),
            "rss-desklet-cache.json"
        ]);
    }

    // --CLEANUP

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
        this.leftFade?.destroy();
        this.rightFade?.destroy();
    }

    _destroyChildrenSafely(container) {

        if (!container)
            return;

        let children = container.get_children();

        children.forEach(actor => {

            if (actor._signalIds) {

                actor._signalIds.forEach(id => {
                    try {
                        actor.disconnect(id);
                    } catch (e) {}
                });

                actor._signalIds = null;
            }

            actor.destroy();
        });
    }
};

function main(metadata, deskletId) {
    return new RSSDesklet(metadata, deskletId);
}