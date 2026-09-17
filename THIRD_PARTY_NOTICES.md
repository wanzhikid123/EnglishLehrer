# Emoji 素材与数据

- **Twemoji** graphics by Twitter, Inc. and other contributors: [project](https://github.com/jdecked/twemoji). Graphics licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Served locally, unmodified, as SVG images. The installed `@twemoji/svg@15.0.0` distribution includes 3,720 files; its packaging/optimization is by Samuel Kopp under MIT (license in `node_modules/@twemoji/svg/license`).
- **Emojibase data** by Miles Johnson and contributors: [project](https://github.com/milesj/emojibase), [datasets](https://emojibase.dev/docs/datasets/). MIT (license in `node_modules/emojibase-data/LICENSE`). Uses the English and German names from `emojibase-data@17.0.0` on the local server. Only entries with a locally available SVG are offered.

Emoji are served from `/assets/emoji/` on the local service. The browser does not call an emoji CDN. `npm ci` restores pinned dependencies from `package-lock.json`.
