var FeedController = class FeedController {

    constructor(owner) {

        this.owner = owner;
    }

    reload() {

        this.owner.lastHeadlines = [];

        this.fetchFeeds();
    }

    fetchFeeds() {

        const d = this.owner;

        if (d._fetchingFeeds)
            return;

        d._fetchingFeeds = true;

        d.contextMenu.updateLastRefreshTime();

        const feeds =
            d._getFeedList();

        if (!feeds.length) {

            d._fetchingFeeds = false;

            if (d.showCrypto) {

                d._hideEmptyMessage();

                d.lastHeadlines = [];

                d.tickerBuilder.rebuild([]);

            } else {

                d._showEmptyMessage(
                    "No Feeds Configured"
                );
            }

            return;
        }

        d.feedService.fetch(
            feeds,
            {
                allowNSFW:
                    d.AllowNSFW,

                showSource:
                    d.showSource,

                showRedditSource:
                    d.showRedditSource
            },
            result => {

                this._handleFeedResult(result);
            }
        );
    }

    _handleFeedResult(result) {

        const d = this.owner;

        d._fetchingFeeds = false;

        const processed =
            d.headlineProcessor.process(
                result.rss,
                result.reddit,
                {
                    randomise:
                        d.randomise,

                    maxRSSHeadlines:
                        d.maxRSSHeadlines,

                    maxRedditHeadlines:
                        d.maxRedditHeadlines
                }
            );

        if (
            processed.headlines.length === 0 &&
            d.lastHeadlines &&
            d.lastHeadlines.length > 0
        ) {

            d.usingCachedData = true;

            d._updateCacheIndicator();

            d.tickerBuilder.rebuild(
                d.lastHeadlines
            );

            return;
        }

        d.feedStats =
            processed.stats;

        d.lastHeadlines =
            processed.headlines;

        if (
            d.lastHeadlines.length > 0 ||
            d.showCrypto
        ) {

            d._hideEmptyMessage();

        } else {

            d._showEmptyMessage(
                "No Feeds Configured"
            );
        }

        d.usingCachedData = false;

        d._updateCacheIndicator();

        d.tickerBuilder.rebuild(
            d.lastHeadlines
        );

        d.contextMenu.updateFeedStats();

        d.cache.saveRSSCache(
            d.lastHeadlines || [],
            d.cryptoData || []
        );
    }

    rebuildFromScratch() {

        const d = this.owner;

        d.tickerController.stop();

        d.offset = 0;

        d.pendingHeadlines = null;

        d.lastHeadlines = [];

        d._destroyChildrenSafely(
            d.tickerBox1
        );

        this.fetchFeeds();

        d.tickerController.start();
    }

    restoreCache() {

        const d = this.owner;

        const cache =
            d.cache.loadRSSCache();

        if (!cache)
            return false;

        d.lastHeadlines =
            cache.headlines || [];

        d.cryptoData =
            cache.cryptoData || [];

        d.contextMenu.updateFeedStats();

        d.tickerBuilder.rebuild(
            d.lastHeadlines
        );

        return true;
    }
};