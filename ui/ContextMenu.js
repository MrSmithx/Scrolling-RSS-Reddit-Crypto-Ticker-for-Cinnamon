const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

var ContextMenu = class ContextMenu {

    constructor(owner) {

        this.owner = owner;

        this._build();
    }

    _build() {

        const d = this.owner;

        d._menu = new PopupMenu.PopupMenu(
            d.actor,
            0.0,
            St.Side.TOP
        );

        Main.uiGroup.add_actor(
            d._menu.actor
        );

        d._menu.actor.hide();

        d._menuManager.addMenu(
            d._menu
        );

        // -----------------------------
        // Update All Feeds
        // -----------------------------

        const updateItem =
            new PopupMenu.PopupIconMenuItem(
                "Update All Feeds",
                "view-refresh-symbolic",
                St.IconType.SYMBOLIC
            );

        updateItem.connect(
            "activate",
            () => {

                Main.notify(
                    "Scrolling RSS, Reddit & Crypto Ticker",
                    "Updating Feeds..."
                );

                d.refreshAllFeeds();
            }
        );

        d._menu.addMenuItem(
            updateItem
        );

        // -----------------------------
        // Remove & Refresh
        // -----------------------------

        const refreshItem =
            new PopupMenu.PopupIconMenuItem(
                "Remove & Refresh All Feeds",
                "edit-delete",
                St.IconType.SYMBOLIC
            );

        refreshItem.connect(
            "activate",
            () => {

                Main.notify(
                    "Scrolling RSS, Reddit & Crypto Ticker",
                    "Removing & Refreshing Feeds..."
                );

                Mainloop.idle_add(() => {

                    d.rebuildFeeds();

                    return false;
                });
            }
        );

        d._menu.addMenuItem(
            refreshItem
        );

        // -----------------------------
        // Separator
        // -----------------------------

        d._menu.addMenuItem(
            new PopupMenu.PopupSeparatorMenuItem()
        );

        // -----------------------------
        // Last Refresh
        // -----------------------------

        d.lastRefreshMenuItem =
            new PopupMenu.PopupMenuItem(
                "Last Refresh: Never"
            );

        d.lastRefreshMenuItem.setSensitive(
            false
        );

        d._menu.addMenuItem(
            d.lastRefreshMenuItem
        );

        // -----------------------------
        // Feed Stats
        // -----------------------------

        d.feedStatsMenuItem =
            new PopupMenu.PopupMenuItem(
                "Feeds: ..."
            );

        d.feedStatsMenuItem.setSensitive(
            false
        );

        d._menu.addMenuItem(
            d.feedStatsMenuItem
        );

        this.updateLastRefreshTime();
        this.updateFeedStats();
    }

    updateLastRefreshTime() {

        const d = this.owner;

        d.lastRefreshTime =
            new Date();

        if (!d.lastRefreshMenuItem)
            return;

        d.lastRefreshMenuItem.label.set_style(`
            color: white;
            font-size: 9pt;
            font-family: monospace;
        `);

        d.lastRefreshMenuItem.label.text =
            "Last Refresh: " +
            d.lastRefreshTime.toLocaleString();
    }

    updateFeedStats() {

        const d = this.owner;

        if (!d.feedStatsMenuItem)
            return;

        const rssSources =
            d.feedURLs
                ? d.feedURLs
                    .split("\n")
                    .filter(Boolean)
                    .length
                : 0;

        const redditSources =
            d.redditFeeds
                ? d.redditFeeds
                    .split("\n")
                    .filter(Boolean)
                    .length
                : 0;

        const stats =
            d.feedStats || {};

        const pad =
            (str, len) =>
                String(str).padEnd(len);

        d.feedStatsMenuItem.label.set_style(`
            color: white;
            font-size: 9pt;
            font-family: monospace;
        `);

        d.feedStatsMenuItem.label.text =
            `${pad("Sources", 12)} RSS ${pad(rssSources, 5)} Reddit ${redditSources}\n` +
            `${pad("Retrieved", 12)} RSS ${pad(stats.rssRetrieved, 5)} Reddit ${stats.redditRetrieved}\n` +
            `${pad("Limited", 12)} RSS ${pad(stats.rssAfterLimit, 5)} Reddit ${stats.redditAfterLimit}\n` +
            `${pad("Displayed", 12)} RSS ${pad(stats.rssDisplayed, 5)} Reddit ${stats.redditDisplayed}`;
    }
};