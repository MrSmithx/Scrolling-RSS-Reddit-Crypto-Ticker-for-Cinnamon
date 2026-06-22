# Scrolling RSS, Reddit & Crypto Ticker Desklet

A highly configurable Cinnamon Desklet that combines **RSS feeds**, **Reddit feeds**, and **Cryptocurrency prices** into a smooth horizontally scrolling ticker.

Designed for Linux Mint Cinnamon desktops, this desklet provides a lightweight information dashboard with caching, offline support, favicons, crypto icons, custom styling, and automatic refresh services.

<img width="1920" height="1080" alt="Screenshot" src="https://github.com/user-attachments/assets/3672ad8b-3cd2-4b2f-b586-fd46d94c0a92" />

---

## Features

### RSS Feed Support

* Multiple RSS feeds
* Multiple Atom feeds
* Automatic feed refresh
* Per-feed headline limits
* Optional source labels
* Feed deduplication
* Randomized headline ordering
* Feed favicon support
* Offline cache fallback

### Reddit Support

* Multiple subreddit support
* Uses native Reddit RSS feeds
* Configurable sorting:

  * Hot
  * New
  * Top
  * Rising
* NSFW filtering
* Reddit icon support
* Independent refresh interval
* Cached Reddit headline recovery

### Cryptocurrency Ticker

Powered by CoinGecko.

Features:

* Track multiple cryptocurrencies
* Supports:

  * Coin IDs
  * Symbols
  * Coin names
* Custom fiat currency selection
* 24-hour percentage change
* Up/Down indicators
* Cryptocurrency logos
* Cached coin metadata
* Automatic refresh

Examples:

```text
bitcoin
ethereum
solana
doge
ada
```

---

## Display Features

### Smooth Infinite Scrolling

* Continuous ticker animation
* Pause on mouse hover
* Mouse wheel manual scrolling
* Reverse scrolling option
* Adjustable speed

### Visual Effects

* Configurable transparency
* Custom colors
* Custom fonts
* Optional fade effects
* Dynamic sizing
* Source favicons
* Crypto icons

### Interactive Headlines

Click any headline to open the article in your default browser.

Supported:

* RSS links
* Atom links
* Reddit posts

---

## Offline Cache Support

The desklet automatically stores:

* Headlines
* Reddit data
* Cryptocurrency data
* CoinGecko coin metadata
* Favicons
* Cryptocurrency logos

If feeds become unavailable:

* Previously downloaded headlines are displayed
* Cached crypto data remains available
* An **Offline Cache** indicator is shown

---

## Cache Structure

```text
~/.cache/rss-desklet/

├── rss-desklet-cache.json
├── rss-desklet-coins.json

├── rss-desklet-icons/
│   ├── bbc.png
│   ├── cnn.png
│   ├── bitcoin.png
│   └── ethereum.png
```

---

## Configuration

### RSS Settings

| Setting       | Description                   |
| ------------- | ----------------------------- |
| Show RSS      | Enable RSS feeds              |
| Feed URLs     | One URL per line              |
| Max Headlines | Maximum RSS headlines         |
| Show Source   | Display source names          |
| Randomise     | Randomise headline order      |
| Show Favicons | Download and display favicons |

---

### Reddit Settings

| Setting              | Description              |
| -------------------- | ------------------------ |
| Enable Reddit        | Enable Reddit feeds      |
| Reddit Feeds         | One subreddit per line   |
| Reddit Sort          | Hot / New / Top / Rising |
| Max Reddit Headlines | Maximum Reddit items     |
| Show Reddit Source   | Display subreddit names  |
| Show Reddit Icons    | Display Reddit icon      |
| Allow NSFW           | Include NSFW posts       |

Example:

```text
linux
technology
worldnews
cinnamon
```

---

### Cryptocurrency Settings

| Setting           | Description          |
| ----------------- | -------------------- |
| Show Crypto       | Enable crypto ticker |
| Crypto Symbols    | Coins to track       |
| Crypto Currency   | Fiat currency        |
| Show Crypto Icons | Display logos        |
| Refresh Interval  | Refresh pricing data |

Example:

```text
bitcoin
ethereum
solana
```

---

### Appearance Settings

| Setting            | Description             |
| ------------------ | ----------------------- |
| Width              | Desklet width           |
| Height             | Desklet padding         |
| Font Family        | Custom font             |
| Font Color         | Text colour             |
| Text Opacity       | Text transparency       |
| Background Color   | Background colour       |
| Background Opacity | Background transparency |
| Enable Fade        | Edge fade effect        |

---

## Context Menu

Right-click the desklet for quick actions:

### Refresh All Feeds

Immediately refresh:

* RSS feeds
* Reddit feeds
* Cryptocurrency data

### Remove & Refresh All Feeds

Clears current ticker data and rebuilds everything from scratch.

### Feed Statistics

Displays:

```text
Sources     RSS x     Reddit x
Retrieved   RSS x     Reddit x
Displayed   RSS x     Reddit x
```

### Last Refresh Time

Shows the timestamp of the most recent successful refresh.

---

## Supported Feed Formats

### RSS 2.0

```xml
<item>
```

### Atom

```xml
<entry>
```

The desklet automatically detects the feed type.

---

## Dependencies

Requires:

* Cinnamon Desktop
* GJS
* libsoup
* GLib
* Gio
* St
* Clutter
* Pango

Typically available on Linux Mint Cinnamon installations.

---

## Performance

Designed to be lightweight:

* Async network requests
* Cached favicon downloads
* Cached crypto logo downloads
* Cached CoinGecko metadata
* Cached headlines
* Minimal memory usage
* Safe cleanup on desklet removal

---

## Privacy

The desklet communicates only with:

### User-configured RSS feeds

Any RSS or Atom feed you choose.

### Reddit RSS

```text
https://www.reddit.com/r/<subreddit>/<sort>.rss
```

### CoinGecko API

```text
https://api.coingecko.com/api/v3
```

### Google Favicon Service

```text
https://www.google.com/s2/favicons
```

No analytics, tracking, or telemetry are included.

---

## License

MIT License

---

## Support

If you enjoy this project and would like to support development, donation options are available directly from the desklet settings.

Contributions, bug reports, feature requests, and pull requests are welcome.
