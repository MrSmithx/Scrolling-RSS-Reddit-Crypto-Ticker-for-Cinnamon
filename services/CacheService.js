const GLib = imports.gi.GLib;

var CacheService = class CacheService {

    constructor() {

        this.cacheDir =
            GLib.get_user_cache_dir();
    }

    _readJSON(path) {

        try {

            if (!GLib.file_test(
                path,
                GLib.FileTest.EXISTS
            )) {
                return null;
            }

            const [success, contents] =
                GLib.file_get_contents(path);

            if (!success || !contents)
                return null;

            return JSON.parse(
                contents.toString()
            );

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

    getRSSCacheFile() {

        return GLib.build_filenamev([
            this.cacheDir,
            "rss-desklet-cache.json"
        ]);
    }

    getCoinCacheFile() {

        return GLib.build_filenamev([
            this.cacheDir,
            "rss-desklet-coins.json"
        ]);
    }

    saveRSSCache(
        headlines,
        cryptoData
    ) {

        this._writeJSON(
            this.getRSSCacheFile(),
            {
                headlines,
                cryptoData,
                timestamp: Date.now()
            }
        );
    }

    loadRSSCache() {

        return this._readJSON(
            this.getRSSCacheFile()
        );
    }

    saveCoinList(data) {

        this._writeJSON(
            this.getCoinCacheFile(),
            {
                timestamp: Date.now(),
                data
            }
        );
    }

    loadCoinList(maxAgeMs) {

        const cache =
            this._readJSON(
                this.getCoinCacheFile()
            );

        if (
            !cache?.timestamp ||
            !cache?.data
        ) {
            return null;
        }

        const age =
            Date.now() - cache.timestamp;

        if (age > maxAgeMs)
            return null;

        return cache.data;
    }
};