const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;

var FaviconManager = class FaviconManager {

    constructor(owner) {
        this.owner = owner;
    }

    getDir() {

        const dir =
            GLib.build_filenamev([
                GLib.get_user_cache_dir(),
                "rss-desklet-icons"
            ]);

        GLib.mkdir_with_parents(
            dir,
            0o755
        );

        return dir;
    }

    getPath(domain) {

        return GLib.build_filenamev([
            this.getDir(),
            domain + ".png"
        ]);
    }

    fetch(domain) {

        if (!domain)
            return;

        const path =
            this.getPath(domain);

        if (
            GLib.file_test(
                path,
                GLib.FileTest.EXISTS
            )
        ) {
            return;
        }

        const url =
            `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

        this.owner.network.download(
            url,
            path
        );
    }

    createIcon(domain) {

        const path =
            this.getPath(domain);

        if (
            !GLib.file_test(
                path,
                GLib.FileTest.EXISTS
            )
        ) {
            return null;
        }

        try {

            const file =
                Gio.file_new_for_path(path);

            const gicon =
                Gio.FileIcon.new(file);

            const icon =
                new St.Icon({
                    gicon,
                    icon_size:
                        this.owner.fontParts.size
                });

            icon.set_style(`
                margin-right: 10px;
            `);

            return icon;

        } catch (e) {

            global.logError(e);

            return null;
        }
    }
};