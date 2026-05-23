# Improve iNat Somewhat

A userscript for making iNaturalist easier to skim and annotate. It improves the dashboard update feed with filtering/highlighting controls, adds nickname expansion in observation comments, and adds observation-page helpers for filling host-plant observation fields from the Notes section.

## Install

Install with a userscript manager such as Tampermonkey, Violentmonkey, or Greasemonkey.

Recommended install source:

[Install Improve iNat Somewhat from Greasy Fork](https://greasyfork.org/en/scripts/579390-improve-inat-somewhat)

You can also install directly from the GitHub source if you prefer:

[Install from GitHub raw source](https://raw.githubusercontent.com/tbsisan/iNaturalist-userscript/main/improve-inat-somewhat.user.js)

If the GitHub install prompt does not open automatically, copy this URL into your userscript manager:

```text
https://raw.githubusercontent.com/tbsisan/iNaturalist-userscript/main/improve-inat-somewhat.user.js
```

## Updates

Greasy Fork is the recommended install/update source. The userscript metadata also includes `@downloadURL` and `@updateURL` pointing at the GitHub raw file, so compatible userscript managers can check GitHub for updates when installed from GitHub.

## Features

### Dashboard update filtering

On iNaturalist dashboard pages (`/home` and `/users/dashboard_updates`), the script can reduce noise in the update feed.

- Dims common lower-priority dashboard updates by default:
  - subscribed species/taxon update cards such as “New observations of ...”
  - followed-user observation update cards such as “... added 12 observations”
- Provides user-toggleable built-in filters from the userscript-manager menu.
- Supports additive custom dimming regexes.
- Supports additive custom highlighting regexes.
- Supports four handling modes for matched cards:
  - `dim` — grey cards but keep them visible
  - `shrink` — dim cards and reduce the timeline body; click Expand/body to restore
  - `collapse` — hide cards with `display: none`
  - `remove` — delete matched cards from the page
- Handles dynamically loaded dashboard cards, including iNat’s “More” behavior where the feed can be replaced instead of simply appended.
- Shows a small status badge with matched/highlighted counts, enabled filters, nickname count, and current mode.

### Userscript menu controls

The script adds Tampermonkey/Greasemonkey/Violentmonkey menu commands for:

- showing current status
- showing current dimming/highlighting regexes
- adding dimming regexes
- clearing all dimming regexes
- adding highlighting regexes
- clearing all highlighting regexes
- adding, showing, editing, and clearing nickname mappings
- toggling built-in filters
- choosing the dimming mode
- rerunning filters

### Nickname expansion in observation comments

On observation pages, saved nickname mappings can be used as typing shortcuts in comment boxes.

- Nicknames are saved as `nickname=@username` pairs.
- Usernames are normalized automatically with `@`.
- Comma-separated username lists are supported and normalized individually.
- Example mappings:

```text
tom=tom1548
sc=sbrobeson, carnifex
```

are stored/displayed as:

```text
tom=@tom1548
sc=@sbrobeson, @carnifex
```

- In an observation comment textarea, type the nickname followed by Space to expand it.
- Example:

```text
sc␠
```

expands to:

```text
@sbrobeson, @carnifex␠
```

### Observation host-plant field helper

On observation pages, the script can detect a host plant from the observation Notes and add a button to fill host-related observation fields.

- Looks for host-plant patterns near the start of Notes, including:

```text
on Parthenocissus inserta
host: Parthenocissus inserta
```

and italic/HTML forms like:

```html
on <em>Parthenocissus inserta</em>
```

- Adds a button near Notes:

```text
Fill host fields: <taxon>
```

- When clicked, it uses iNaturalist’s own jQuery/autocomplete UI to fill these observation fields in order:
  - `Host`
  - `Host plant`
  - `Host Plant ID`
- For each field, it:
  1. selects the observation field from the “Choose a field” autocomplete
  2. closes the field autocomplete if iNat leaves it stuck open
  3. enters the host taxon into the species-name autocomplete
  4. selects the matching taxon dropdown result
  5. clicks the visible `Add` button
- Logs each step to the browser console with `host plant:` messages to make live debugging easier.

#### Host taxon matching details

The host helper includes several iNat-specific taxon-name normalizations:

- Matches taxon dropdown entries against the full visible `.ac-label`, not only `.title` or `.subtitle`, because old names/synonyms can appear in different parts of the dropdown.
- Handles hybrid markers:
  - Notes may use `×` or plain `x`.
  - The species search field uses plain `x`.
  - Dropdown matching accepts either `x` or `×`.
- Handles `aff.` / `aff` by removing it and selecting the remaining taxon normally.
  - Example: `Quercus aff. alba` → search/select `Quercus alba`.
- Handles `cf.` / `cf` by selecting the genus instead of the species.
  - Example: `Quercus cf. alba` → search `Quercus`, then select the dropdown entry labeled `Genus Quercus`.
  - This accounts for iNat subtitle markup such as:

```html
<span>Genus<!-- --> <i>Quercus</i></span>
```

## Development / validation

Before committing changes, run:

```bash
node --check improve-inat-somewhat.user.js
git diff --check
```

Host-field automation depends on iNaturalist’s live autocomplete DOM and event behavior, so browser testing and console logs may still be needed after syntax validation.

## License

MIT. See [LICENSE](LICENSE).
