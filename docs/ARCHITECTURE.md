# Architecture

The published site is static. Safari loads the page, and IndexedDB holds worlds, events, players, transactions, items, goals, sessions, and backups.

There is no account and no server-side database. Offline writes stay on the phone because they never leave the browser. A service worker caches the page, styles, and scripts after the first visit.

GitHub Actions tests the rule parser, then deploys the `site` folder to GitHub Pages.
