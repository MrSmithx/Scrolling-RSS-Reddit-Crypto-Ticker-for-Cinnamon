var TickerController = class TickerController {

    constructor(owner) {

        this.owner = owner;
    }

    start() {

        const d = this.owner;

        d.offset = 0;

        d.loops.add(
            "ticker",
            25,
            () => {

                const step =
                    Math.max(
                        0.5,
                        d.speed / 2
                    );

                if (d.isPaused)
                    return true;

                if (
                    d._destroyed ||
                    !d.tickerBox1 ||
                    !d.tickerClone
                ) {
                    return true;
                }

                const width =
                    d.tickerWidth || 0;

                if (width <= 0)
                    return true;

                const direction =
                    d.scrollReverse
                        ? -1
                        : 1;

                d.offset +=
                    step * direction;

                if (!d.scrollReverse) {

                    if (
                        d.offset >= width
                    ) {
                        d.offset -= width;
                    }

                } else {

                    if (
                        d.offset < 0
                    ) {
                        d.offset += width;
                    }
                }

                d.tickerBox1.set_position(
                    -d.offset,
                    0
                );

                d.tickerClone.set_position(
                    width - d.offset,
                    0
                );

                return true;
            }
        );
    }

    stop() {

        this.owner.loops.remove(
            "ticker"
        );
    }
};