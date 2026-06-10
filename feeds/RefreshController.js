var RefreshController = class RefreshController {

    constructor(owner) {
        this.owner = owner;
    }

    // =====================================
    // MAIN FEEDS
    // =====================================

    startFeedRefresh() {

        const d = this.owner;

        const interval =
            Math.max(
                1,
                d.refreshInterval
            ) * 60;

        d.loops.add(
            "refresh",
            interval,
            () => {

                d._fetchFeeds();

                return true;
            },
            true
        );
    }

    stopFeedRefresh() {

        this.owner.loops.remove(
            "refresh"
        );
    }

    restartFeedRefresh() {

        this.stopFeedRefresh();
        this.startFeedRefresh();
    }

    // =====================================
    // REDDIT
    // =====================================

    startRedditRefresh() {

        const d = this.owner;

        const interval =
            Math.max(
                1,
                d.redditRefreshInterval || 10
            ) * 60;

        d.loops.add(
            "reddit",
            interval,
            () => {

                if (d.enableReddit)
                    d._fetchFeeds();

                return true;
            },
            true
        );
    }

    stopRedditRefresh() {

        this.owner.loops.remove(
            "reddit"
        );
    }

    restartRedditRefresh() {

        this.stopRedditRefresh();
        this.startRedditRefresh();
    }

    // =====================================
    // CRYPTO
    // =====================================

    startCryptoRefresh() {

        const d = this.owner;

        const interval =
            Math.max(
                1,
                d.cryptoRefreshInterval || 5
            ) * 60;

        d.loops.add(
            "crypto",
            interval,
            () => {

                d._fetchCrypto();

                return true;
            },
            true
        );
    }

    stopCryptoRefresh() {

        this.owner.loops.remove(
            "crypto"
        );
    }

    restartCryptoRefresh() {

        this.stopCryptoRefresh();
        this.startCryptoRefresh();
    }
};