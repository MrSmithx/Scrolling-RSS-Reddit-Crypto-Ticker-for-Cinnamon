var CryptoController = class CryptoController {

    constructor(owner) {

        this.owner = owner;
    }

    fetchCrypto() {

        const d = this.owner;

        if (!d.showCrypto) {

            if (d.feedController)
                d.feedController.fetch();

            return;
        }

        const symbols =
            (d.cryptoSymbols ||
                "bitcoin\nethereum")
                .split("\n")
                .map(s => s.trim())
                .filter(Boolean);

        const currency =
            (d.cryptoCurrency || "usd")
                .toLowerCase();

        d.cryptoService.fetch(
            symbols,
            currency,
            cryptoData => {

                if (!cryptoData)
                    return;

                d.cryptoData = cryptoData;

                d.tickerBuilder.rebuild(
                    d.lastHeadlines || []
                );

                if (d.cache)
                    d.cache.saveRSSCache(
                        d.lastHeadlines || [],
                        d.cryptoData || []
                    );
            }
        );
    }

    refresh() {

        this.fetch();
    }

    clear() {

        this.owner.cryptoData = [];
    }
};