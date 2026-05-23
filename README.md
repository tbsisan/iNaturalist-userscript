# Improve iNat Somewhat

A userscript for making iNaturalist easier to skim and annotate. It improves the dashboard update feed with filtering/highlighting controls, adds nickname expansion in observation comments, adds project-group helpers for observation pages, and adds observation-page helpers for filling host-plant observation fields from the Notes section.

## Install

Ensure you have a userscript manager in your browser, such as Tampermonkey, Greasemonkey, or Violentmonkey. Then install this userscript from Greasy Fork:

[Install Improve iNat Somewhat from Greasy Fork](https://greasyfork.org/en/scripts/579390-improve-inat-somewhat)

Alternatively, copy and paste the source code from the GitHub raw source link into your userscript manager:

[GitHub raw source](https://raw.githubusercontent.com/tbsisan/iNaturalist-userscript/main/improve-inat-somewhat.user.js)

```text
https://raw.githubusercontent.com/tbsisan/iNaturalist-userscript/main/improve-inat-somewhat.user.js
```

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
- creating, adding, showing, editing, and clearing project groups
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

### Project groups for observation pages

On observation pages, saved project groups can be used to add the observation to the same set of projects later.

- Adds small buttons near the “Add to a Project” input:
  - `Save project group` — saves all projects currently listed on the observation as a named group.
  - `Add project group` — prompts for a saved group name and adds each project in that group to the observation.
- Project groups are saved as `group=Project One, Project Two` lists and can be shown/edited/cleared from the userscript-manager menu.
- Keyboard shortcuts are available when focus is not inside an input/textarea:
  - `Ctrl-M`, then `Ctrl-P` — make/save a project group from the current observation page.
  - `Ctrl-A`, then `Ctrl-P` — add a saved project group to the current observation page.
- When adding a group, projects already present on the observation are skipped.
- If a project opens iNaturalist’s required-fields modal, the script pauses and asks you to fill out the modal and click `Add to Project`; after the modal closes, it continues with the remaining projects.
- Project adding uses iNaturalist’s own “Add to a Project” autocomplete and clicks the matching project title.

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
Fill host field(s): <taxon>
```

- As soon as the button is added, it starts a background iNaturalist v1 `/taxa` API lookup for the candidate host taxon.
- When that lookup returns, the button label is updated with the host's iconic taxon, for example:

```text
Fill host plant field(s): Parthenocissus inserta
Fill host fungi field(s): Boletus something
Fill host insect field(s): Danaus plexippus
```

- When clicked, it reuses that completed/in-flight lookup and then uses iNaturalist’s own jQuery/autocomplete UI to fill host-related observation fields.
- The lookup checks the candidate host taxon against the iNaturalist v1 `/taxa` API.
  - If the first taxa result has `iconic_taxon_name: "Plantae"`, it fills all host-plant fields.
  - If the candidate host is not Plantae, or if the lookup fails, it only fills the generic `Host` field.
- For plant hosts, it fills these observation fields in order:
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
