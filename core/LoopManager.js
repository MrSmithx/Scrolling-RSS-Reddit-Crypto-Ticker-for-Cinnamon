const Mainloop = imports.mainloop;

var LoopManager = class LoopManager {

    constructor() {
        this.loops = {};
    }

    add(name, interval, callback, seconds = false) {

        this.remove(name);

        const id = seconds
            ? Mainloop.timeout_add_seconds(
                interval,
                callback
            )
            : Mainloop.timeout_add(
                interval,
                callback
            );

        this.loops[name] = id;

        return id;
    }

    remove(name) {

        const id =
            this.loops[name];

        if (!id)
            return;

        Mainloop.source_remove(id);

        delete this.loops[name];
    }

    clear() {

        for (const name in this.loops) {

            Mainloop.source_remove(
                this.loops[name]
            );
        }

        this.loops = {};
    }
};