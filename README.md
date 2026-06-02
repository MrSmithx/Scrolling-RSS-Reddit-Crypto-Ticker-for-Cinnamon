# Scrolling RSS, Reddit & Crypto Ticker Desklet

A highly configurable Cinnamon Desklet that displays a continuously scrolling ticker containing:

* RSS news feeds
* Reddit subreddit feeds
* Cryptocurrency prices and 24h changes

The desklet combines multiple content sources into a smooth horizontal ticker with optional fade effects, favicons, caching, custom styling, and automatic refresh scheduling.

---

## Features

### News Feeds

* Support for multiple RSS feeds
* Custom feed list configuration
* Optional source labels
* Automatic duplicate removal
* Random headline ordering
* Click headlines to open articles in your default browser

### Reddit Integration

* Display headlines from one or more subreddits
* Configurable sorting:

  * Hot
  * New
  * Top
  * Rising
* Optional subreddit labels
* NSFW filtering support
* Independent refresh interval

### Cryptocurrency Ticker

Live cryptocurrency pricing powered by CoinGecko.

Displays:

* Coin symbol
* Current price
* 24-hour percentage change
* Up/down indicators
* Multiple currency support

Supported input formats:

* Coin IDs (`bitcoin`)
* Symbols (`btc`)
* Coin names (`Bitcoin`)

### Visual Customisation

* Adjustable desklet width
* Adjustable ticker height
* Custom fonts
* Custom text colours
* Adjustable text opacity
* Custom background colour
* Adjustable background opacity
* Optional edge fade effect

### Interaction

* Pause ticker on hover
* Click headlines to open links
* Right-click context menu
* Manual feed refresh

### Performance

* Local headline caching
* Coin list caching
* Cached crypto data fallback
* Cached RSS headline fallback
* Asynchronous networking
* Automatic cleanup of timers and signals

---

## Configuration Options

### RSS Settings

| Setting       | Description                     |
| ------------- | ------------------------------- |
| Show RSS      | Enable RSS feeds                |
| Feed URLs     | List of RSS feed URLs           |
| Max Headlines | Maximum number of RSS headlines |
| Show Source   | Display source names            |

### Reddit Settings

| Setting              | Description              |
| -------------------- | ------------------------ |
| Enable Reddit        | Enable Reddit feeds      |
| Reddit Feeds         | List of subreddit names  |
| Reddit Sort          | Hot, New, Top, Rising    |
| Max Reddit Headlines | Maximum Reddit entries   |
| Show Reddit Source   | Display subreddit labels |
| Allow NSFW           | Include NSFW posts       |

### Crypto Settings

| Setting          | Description             |
| ---------------- | ----------------------- |
| Show Crypto      | Enable crypto ticker    |
| Crypto Symbols   | List of coins to track  |
| Currency         | Display currency        |
| Refresh Interval | Crypto update frequency |

### Appearance

| Setting            | Description             |
| ------------------ | ----------------------- |
| Width              | Desklet width           |
| Height             | Vertical padding        |
| Font               | Font family and size    |
| Font Colour        | Text colour             |
| Background Colour  | Background colour       |
| Background Opacity | Background transparency |
| Text Opacity       | Text transparency       |
| Fade Effect        | Enable edge fading      |

### Ticker Behaviour

| Setting           | Description                           |
| ----------------- | ------------------------------------- |
| Speed             | Scroll speed                          |
| Reverse Direction | Scroll right-to-left or left-to-right |
| Pause on Hover    | Automatically pauses when hovered     |

---

## Example RSS Configuration

```text
https://rss.cnn.com/rss/edition.rss
https://feeds.bbci.co.uk/news/rss.xml
https://www.theguardian.com/world/rss
```

---

## Example Reddit Configuration

```text
linux
technology
worldnews
cryptocurrency
```

---

## Example Crypto Configuration

```text
bitcoin
ethereum
solana
dogecoin
```

You may also use:

```text
btc
eth
sol
doge
```

---

## Caching

The desklet stores cached data under:

```text
~/.cache/rss-desklet-cache.json
~/.cache/rss-desklet-coins.json
```

Favicons are cached in:

```text
~/.cache/rss-desklet-icons/
```

This allows the ticker to continue displaying information even when a feed or API is temporarily unavailable.

---

## Data Sources

### RSS

Any valid RSS or Atom feed.

### Reddit

Uses Reddit's public RSS feeds:

```text
https://www.reddit.com/r/<subreddit>/<sort>.rss
```

### Cryptocurrency Prices

Powered by CoinGecko:

```text
https://api.coingecko.com
```

---

## Context Menu

Right-click the desklet to access:

### Refresh Feeds

Immediately refresh:

* RSS feeds
* Reddit feeds
* Cryptocurrency prices

---

## Behaviour

### Hover

Hovering over the ticker pauses scrolling.

### Click

Clicking a headline opens the associated article in your default browser using:

```bash
xdg-open
```

### Refresh

Content refreshes automatically based on configured intervals.

---

## Technical Highlights

* GJS (GNOME JavaScript)
* Cinnamon Desklet API
* Soup HTTP networking
* GLib caching and file management
* Clutter animations and layouts
* Asynchronous feed loading
* Dynamic actor rebuilding
* Automatic resource cleanup

---

## Requirements

* Cinnamon Desktop
* GJS
* Network access
* CoinGecko API access
* Reddit RSS availability

---

## License

MIT License

Copyright (c) 2026 Martyn Smith

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Support

If you find this desklet useful and would like to support development, donation addresses can be accessed directly within the desklet settings.
