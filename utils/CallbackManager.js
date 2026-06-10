const St = imports.gi.St;
const Main = imports.ui.main;

var CallbackManager = class CallbackManager {

    constructor(owner) {
        this.owner = owner;
    }

    onCryptoUpdatePressed() {

        this.owner._fetchCrypto();
    }

    onFeedsUpdatePressed() {

        this.owner._fetchFeeds();
    }

    copyToClipboard(text) {
        St.Clipboard.get_default().set_text(
            St.ClipboardType.CLIPBOARD,
            text
        );
    }

    onCopyBTC() {

        this.copyToClipboard(
            "1PRxxyxpz6Qh5sgdKn1TKKh2NZed3B7NX9"
        );

        Main.notify(
            "Bitcoin Address Copied",
            "Your Support is Greatly Appreciated."
        );
    }

    onCopyETH() {

        this.copyToClipboard(
            "0xe1cA43145846fb476FED56645FCbA0B9B55be79B"
        );

        Main.notify(
            "Ethereum Address Copied",
            "Your Support is Greatly Appreciated."
        );
    }
};