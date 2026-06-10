const St = imports.gi.St;

var FeedParser = class FeedParser {

    parse(xml, feedURL, options = {}) {

        const {
            allowNSFW = false,
            showSource = true,
            showRedditSource = true
        } = options;

        const items = [];

        const source =
            this._extractSource(feedURL);

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

            if (isNSFW && !allowNSFW)
                continue;

            const isReddit =
                /reddit\.com/i.test(feedURL);

            const displayTitle =
                this._formatHeadline(
                    source,
                    cleanTitle,
                    isReddit,
                    showSource,
                    showRedditSource
                );

            items.push({
                title: displayTitle,
                link: cleanLink,
                domain: this._getDomain(cleanLink),
                isReddit: isReddit
            });
        }

        const isReddit =
            /reddit\.com/i.test(feedURL);

        return isReddit
            ? items
            : items;
    }

    _extractRSSItems(xml) {

        const rss =
            xml.match(
                /<item[\s\S]*?<\/item>/gim
            );

        if (rss?.length)
            return rss;

        return (
            xml.match(
                /<entry[\s\S]*?<\/entry>/gim
            ) || []
        );
    }

    _extractTitle(itemXML) {

        return (
            itemXML.match(
                /<title[^>]*>([\s\S]*?)<\/title>/i
            )?.[1] ?? null
        );
    }

    _extractLink(itemXML) {

        return (
            itemXML.match(
                /<link>([\s\S]*?)<\/link>/i
            )?.[1]
            ??
            itemXML.match(
                /<link[^>]+href=["']([^"']+)["']/i
            )?.[1]
            ??
            itemXML.match(
                /<guid[^>]*>([\s\S]*?)<\/guid>/i
            )?.[1]
            ??
            null
        );
    }

    _extractOver18(itemXML) {

        return /<category[^>]+(?:term|label)=["'](?:over18|nsfw)["']/i
            .test(itemXML);
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

    _decodeEntities(text) {

        if (!text)
            return "";

        try {

            const label = new St.Label();

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

    _formatHeadline(
        source,
        title,
        isReddit,
        showSource,
        showRedditSource
    ) {

        if (isReddit) {

            if (!showRedditSource)
                return title;

        } else {

            if (!showSource)
                return title;
        }

        return `【${source}】 ${title}`;
    }

    _extractSource(url) {

        const reddit =
            url.match(
                /reddit\.com\/r\/([^\/]+)/i
            );

        if (reddit)
            return `r/${reddit[1]}`;

        const match =
            url.match(
                /https?:\/\/(?:www\.)?([^\/]+)/i
            );

        if (!match)
            return "RSS";

        return match[1]
            .replace(/\.(com|org|net)$/i, "");
    }

    _getDomain(url) {

        const match =
            url.match(
                /^https?:\/\/([^\/]+)/i
            );

        return match
            ? match[1].replace(/^www\./, "")
            : null;
    }
};