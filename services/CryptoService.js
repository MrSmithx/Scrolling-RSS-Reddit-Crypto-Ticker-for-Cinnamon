var CryptoService = class CryptoService {

    constructor(httpGet, cacheService) {

        this._httpGet = httpGet;
        this._cache = cacheService;

        this.cryptoSymbolMap = {};
    }

    fetch(symbols, currency, callback) {

        const cachedCoinList =
            this._cache.loadCoinList(
                24 * 60 * 60 * 1000
            );

        if (cachedCoinList) {

            this._processCoinList(
                cachedCoinList,
                symbols,
                currency,
                callback
            );

            return;
        }

        const url =
            "https://api.coingecko.com/api/v3/coins/list";

        this._httpGet(url, stdout => {

            if (!stdout) {

                callback(null);

                return;
            }

            try {

                const coinList =
                    JSON.parse(stdout);

                this._cache.saveCoinList(
                    coinList
                );

                this._processCoinList(
                    coinList,
                    symbols,
                    currency,
                    callback
                );

            } catch (e) {

                global.logError("Crypto parse error: " + e);
                callback([]);
            }
        });
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

    _processCoinList(
        coinList,
        userTokens,
        currency,
        callback
    ) {

        // --------------------------------------------------
        // BUILD LOOKUP MAPS
        // --------------------------------------------------

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

        // --------------------------------------------------
        // RESOLVE TOKENS
        // --------------------------------------------------

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

        // --------------------------------------------------
        // INVALID TOKENS
        // --------------------------------------------------

        if (invalidTokens.length > 0) {

            global.log(
                "Invalid Crypto Tokens: " +
                invalidTokens.join(", ")
            );
        }

        // --------------------------------------------------
        // FETCH PRICES
        // --------------------------------------------------

        let url =
            "https://api.coingecko.com/api/v3/simple/price?ids=" +
            encodeURIComponent(
                validIDs.join(",")
            ) +
            "&vs_currencies=" +
            encodeURIComponent(currency) +
            "&include_24hr_change=true";

            this._httpGet(url, priceStdout => {

                if (!priceStdout) {
                    callback([]);
                    return;
                }

                try {

                    let data =
                        JSON.parse(priceStdout);

                    const result =
                        this._parseCrypto(
                            data,
                            currency
                        );

                    callback(result);

                } catch (e) {

                    global.logError(
                        "Crypto parse error: " + e
                    );
                }
            }
        );
    }

    _parseCrypto(data, currency) {

        const chunks = [];

        for (let key in data) {

            let item = data[key];

            if (
                !item ||
                typeof item !== "object" ||
                !(currency in item)
            ) {
                continue;
            }

            let price = item[currency];

            let changeKey =
                currency + "_24h_change";

            let change =
                item[changeKey] || 0;

            // --------------------------------------------------
            // SYMBOL
            // --------------------------------------------------

            let symbol =
                this.cryptoSymbolMap[key] ||
                key.toUpperCase();

            // --------------------------------------------------
            // PRICE FORMAT
            // --------------------------------------------------

            let formattedPrice;

            if (price >= 1000) {

                formattedPrice =
                    parseFloat(price).toLocaleString(
                        undefined,
                        {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2
                        }
                    );

            } else if (price >= 1) {

                formattedPrice =
                    parseFloat(price).toFixed(2);

            } else {

                formattedPrice =
                    parseFloat(price).toFixed(6);
            }

            // --------------------------------------------------
            // CHANGE FORMAT
            // --------------------------------------------------

            let arrow =
                change >= 0 ? "▲" : "▼";

            let changeText =
                Math.abs(change).toFixed(2);

            // --------------------------------------------------
            // FINAL STRING
            // --------------------------------------------------

            chunks.push({
                symbol: symbol,
                price: formattedPrice,
                change: change,
                arrow: arrow,
                changeText: changeText,
                currencySymbol: this._getCurrencySymbol(currency)
            });
        }

        // --------------------------------------------------
        // NO VALID DATA
        // --------------------------------------------------

        if (chunks.length === 0) {

            global.log(
                "Crypto update ignored: no valid tokens/currency"
            );

            return;
        }

        return chunks;
    }

};