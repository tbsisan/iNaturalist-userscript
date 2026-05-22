# Improve iNat Somewhat

A userscript for improving the iNaturalist dashboard update feed by dimming, shrinking, removing, or highlighting update cards based on built-in filters and custom regexes.

## Install

Install with a userscript manager such as Tampermonkey, Violentmonkey, or Greasemonkey:

[Install Improve iNat Somewhat](https://raw.githubusercontent.com/tbsisan/iNaturalist-userscript/main/improve-inat-somewhat.user.js)

If the install prompt does not open automatically, copy this URL into your userscript manager:

```text
https://raw.githubusercontent.com/tbsisan/iNaturalist-userscript/main/improve-inat-somewhat.user.js
```

## Updates

The userscript metadata includes `@downloadURL` and `@updateURL` pointing at the GitHub raw file, so compatible userscript managers can check GitHub for updates.

## License

MIT. See [LICENSE](LICENSE).

## Features

- Dims common lower-priority iNaturalist dashboard updates.
- Supports additive custom dimming regexes.
- Supports additive custom highlighting regexes.
- Supports a saved `nicknames` map for displaying iNaturalist usernames as nicknames.
- Provides userscript-manager menu controls for status, regex lists, nicknames, built-in filters, and dimming modes.
- Handles dynamically loaded dashboard update cards.
