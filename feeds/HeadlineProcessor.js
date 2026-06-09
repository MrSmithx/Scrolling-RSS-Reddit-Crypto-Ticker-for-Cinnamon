var HeadlineProcessor = class HeadlineProcessor {

    process(rssHeadlines, redditHeadlines, options = {}) {

        const {
            randomise = false,
            maxRSSHeadlines = 10,
            maxRedditHeadlines = 10
        } = options;

        const stats = {
            rssRetrieved: rssHeadlines.length,
            redditRetrieved: redditHeadlines.length,
            rssAfterLimit: 0,
            redditAfterLimit: 0,
            rssDisplayed: 0,
            redditDisplayed: 0
        };

        // ---------------------------------
        // Randomise individual sources
        // ---------------------------------

        if (randomise) {
            this._shuffle(rssHeadlines);
            this._shuffle(redditHeadlines);
        }

        // ---------------------------------
        // Apply limits
        // ---------------------------------

        rssHeadlines =
            rssHeadlines.slice(
                0,
                maxRSSHeadlines
            );

        redditHeadlines =
            redditHeadlines.slice(
                0,
                maxRedditHeadlines
            );

        stats.rssAfterLimit =
            rssHeadlines.length;

        stats.redditAfterLimit =
            redditHeadlines.length;

        // ---------------------------------
        // Merge
        // ---------------------------------

        let headlines =
            rssHeadlines.concat(
                redditHeadlines
            );

        // ---------------------------------
        // Deduplicate
        // ---------------------------------

        headlines =
            this._deduplicate(
                headlines
            );

        // ---------------------------------
        // Final randomisation
        // ---------------------------------

        if (randomise) {
            this._shuffle(headlines);
        }

        // ---------------------------------
        // Display stats
        // ---------------------------------

        stats.rssDisplayed =
            headlines.filter(
                h => !h.isReddit
            ).length;

        stats.redditDisplayed =
            headlines.filter(
                h => h.isReddit
            ).length;

        return {
            headlines,
            stats
        };
    }

    _deduplicate(headlines) {

        const seen = {};

        return headlines.filter(headline => {

            const key =
                headline.link ||
                headline.title;

            if (seen[key])
                return false;

            seen[key] = true;

            return true;
        });
    }

    _shuffle(array) {

        for (
            let i = array.length - 1;
            i > 0;
            i--
        ) {

            const j =
                Math.floor(
                    Math.random() * (i + 1)
                );

            [
                array[i],
                array[j]
            ] = [
                array[j],
                array[i]
            ];
        }
    }
};