const Soup = imports.gi.Soup;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

var NetworkManager = class NetworkManager {

    constructor() {

        this.session = new Soup.Session();

        this.session.user_agent =
            "Mozilla/5.0 (X11; Linux x86_64)";

        this.session.timeout = 10;

        this.cancellable =
            new Gio.Cancellable();
    }

    request(url, callback) {

        try {

            const message =
                Soup.Message.new(
                    "GET",
                    url
                );

            this.session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                this.cancellable,
                (session, result) => {

                    try {

                        const bytes =
                            session.send_and_read_finish(result);

                        const status =
                            message.get_status();

                        if (status !== Soup.Status.OK) {

                            callback(null);

                            return;
                        }

                        callback(bytes);

                    } catch (e) {

                        global.logError(e);

                        callback(null);
                    }
                }
            );

        } catch (e) {

            global.logError(e);

            callback(null);
        }
    }

    get(url, callback) {

        this.request(url, bytes => {

            if (!bytes) {

                callback(null);

                return;
            }

            const data =
                new TextDecoder().decode(
                    bytes.get_data()
                );

            callback(data);
        });
    }

    download(url, path) {

        this.request(url, bytes => {

            if (!bytes)
                return;

            GLib.file_set_contents(
                path,
                bytes.get_data()
            );
        });
    }

    destroy() {

        this.cancellable?.cancel();
    }
};