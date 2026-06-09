var FeedService = class FeedService {

    constructor(network, parser) {

        this.network = network;
        this.parser = parser;
    }

    fetch(feedUrls, options, callback) {

        if (
            !Array.isArray(feedUrls) ||
            feedUrls.length === 0
        ) {

            callback({
                rss: [],
                reddit: []
            });

            return;
        }

        let pending =
            feedUrls.length;

        let rss = [];
        let reddit = [];

        feedUrls.forEach(feedURL => {

            this.network.get(
                feedURL,
                stdout => {

                    if (stdout) {

                        try {

                            const items =
                                this.parser.parse(
                                    stdout,
                                    feedURL,
                                    options
                                );

                            if (
                                items.length > 0 &&
                                items[0].isReddit
                            ) {

                                reddit.push(...items);

                            } else {

                                rss.push(...items);
                            }

                        } catch (e) {

                            global.logError(e);
                        }
                    }

                    pending--;

                    if (pending <= 0) {

                        callback({
                            rss,
                            reddit
                        });
                    }
                }
            );
        });
    }
};