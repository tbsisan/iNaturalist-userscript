// ==UserScript==
// @name         Improve iNat Somewhat
// @namespace    https://www.inaturalist.org/
// @version      0.8.2
// @description  Filter and highlight iNaturalist dashboard update cards.
// @author       Tom + Hermes
// @license      MIT
// @homepageURL  https://github.com/tbsisan/iNaturalist-userscript
// @supportURL   https://github.com/tbsisan/iNaturalist-userscript/issues
// @downloadURL  https://raw.githubusercontent.com/tbsisan/iNaturalist-userscript/main/improve-inat-somewhat.user.js
// @updateURL    https://raw.githubusercontent.com/tbsisan/iNaturalist-userscript/main/improve-inat-somewhat.user.js
// @match        https://www.inaturalist.org/home*
// @match        https://www.inaturalist.org/users/dashboard_updates*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  /***************************************************************************
   * SAFETY-FIRST VERSION
   *
   * This version avoids the likely page-freeze bug from the previous version:
   * it does NOT use a broad MutationObserver on the whole page, and it does NOT
   * edit the DOM repeatedly. Matching cards are dimmed by default.
   ***************************************************************************/

  const CONFIG = {
    // "dim"      = grey/dim cards but keep them in the DOM. Recommended.
    // "collapse" = display:none but keep DOM nodes.
    // "shrink"   = dim card and zoom timeline-body to 30% in x/y; click Expand/body to restore.
    // "remove"   = delete DOM nodes. Not recommended on iNat dashboard.
    mode: "dim",

    showDebugBadge: true,
    debugConsole: true,

    // Set to false if you suspect even the small badge causes trouble.
    addLabelsToCards: true
  };

  const FILTERS = [
    {
      id: "species-observation-updates",
      name: "Species observation updates",
      menuLabel: "Dim subscribed species",
      enabled: true,
      text: /\bNew observations of\b/i,
      notes: "Matches species/taxon subscription cards."
    },
    {
      id: "followed-user-bulk-observation-updates",
      name: "Followed user bulk observation updates",
      menuLabel: "Dim followed user updates",
      enabled: true,
      text: /\b[a-z0-9_.-]+\s+added\s+\d+\s+observations\b|\b[a-z0-9_.-]+ added an observation\b/i,
      notes: "Matches followed-user bulk observation cards."
    }
  ];
  const UPDATE_CONTAINER_SELECTOR = "#updates_target";
  const CARD_SELECTOR = "#updates_target > ul.timeline > li";
  const TITLE_SELECTOR = ".timeline-title";
  const BODY_SELECTOR = ".timeline-body";
  const FILTERED_ATTR = "data-hermes-inat-filtered";
  const REASON_ATTR = "data-hermes-inat-filter-reason";
  const SHRUNK_ATTR = "data-hermes-inat-shrunk";
  const ORIGINAL_BODY_HEIGHT_ATTR = "data-hermes-inat-original-body-height";
  const HIGHLIGHTED_ATTR = "data-hermes-inat-highlighted";
  const HIGHLIGHT_REASON_ATTR = "data-hermes-inat-highlight-reason";
  const STYLE_ID = "hermes-inat-filter-style";
  const BADGE_ID = "hermes-inat-filter-badge";

  let badgeUpdateTimer = null;

  function optionKey(name) {
    return `inat-filter:${name}`;
  }

  function gmGet(name, defaultValue) {
    if (typeof GM_getValue === "function") return GM_getValue(optionKey(name), defaultValue);
    try {
      const stored = window.localStorage.getItem(optionKey(name));
      return stored === null ? defaultValue : JSON.parse(stored);
    } catch (_) {
      return defaultValue;
    }
  }

  function gmSet(name, value) {
    if (typeof GM_setValue === "function") {
      GM_setValue(optionKey(name), value);
      return;
    }
    try {
      window.localStorage.setItem(optionKey(name), JSON.stringify(value));
    } catch (_) {
      // Ignore storage failures; the current page still gets the in-memory value.
    }
  }

  function filterOptionKey(filter) {
    return `filter:${filter.id || filter.name}`;
  }

  function isFilterEnabled(filter) {
    return gmGet(filterOptionKey(filter), filter.enabled);
  }

  function setFilterEnabled(filter, enabled) {
    gmSet(filterOptionKey(filter), enabled);
  }

  function currentMode() {
    const mode = gmGet("mode", CONFIG.mode);
    // Backward compatibility for anyone who saved the old mode name.
    return mode === "soft" ? "dim" : mode;
  }

  function setCurrentMode(mode) {
    CONFIG.mode = mode;
    gmSet("mode", mode);
  }

  function regexPatternList(listName, legacyName) {
    const saved = gmGet(listName, null);
    if (Array.isArray(saved)) return saved.map(pattern => String(pattern).trim()).filter(Boolean);

    // Backward compatibility for versions that stored one regex string. Treat it
    // as the first item in the additive list until the user clears all regexes.
    const legacy = gmGet(legacyName, "");
    return typeof legacy === "string" && legacy.trim() ? [legacy.trim()] : [];
  }

  function setRegexPatternList(listName, legacyName, patterns) {
    gmSet(listName, patterns.map(pattern => String(pattern).trim()).filter(Boolean));
    gmSet(legacyName, "");
  }

  function customRegexPatterns() {
    return regexPatternList("customRegexes", "customRegex");
  }

  function addCustomRegexPattern(pattern) {
    setRegexPatternList("customRegexes", "customRegex", [...customRegexPatterns(), pattern]);
  }

  function clearCustomRegexPatterns() {
    setRegexPatternList("customRegexes", "customRegex", []);
  }

  function highlightRegexPatterns() {
    return regexPatternList("highlightRegexes", "highlightRegex");
  }

  function addHighlightRegexPattern(pattern) {
    setRegexPatternList("highlightRegexes", "highlightRegex", [...highlightRegexPatterns(), pattern]);
  }

  function clearHighlightRegexPatterns() {
    setRegexPatternList("highlightRegexes", "highlightRegex", []);
  }

  function nicknameMap() {
    const saved = gmGet("nicknames", {});
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return nicknameMapFromObject(saved);
  }

  function setNicknameMap(nicknames) {
    gmSet("nicknames", nicknameMapFromObject(nicknames));
  }

  function nicknameMapFromObject(source) {
    const cleaned = {};
    for (const [nickname, username] of Object.entries(source || {})) {
      const cleanNickname = String(nickname || "").trim();
      const cleanUsername = normalizeNicknameUsernameList(username);
      if (cleanNickname && cleanUsername) cleaned[cleanNickname] = cleanUsername;
    }
    return cleaned;
  }

  function normalizeNicknameUsernameList(username) {
    return String(username || "")
      .split(",")
      .map(name => name.trim().replace(/^@+/, ""))
      .filter(Boolean)
      .map(name => `@${name}`)
      .join(", ");
  }

  function addNickname(nickname, username) {
    setNicknameMap({ ...nicknameMap(), [nickname]: username });
  }

  function clearNicknames() {
    setNicknameMap({});
  }

  function nicknameMapLines(nicknames = nicknameMap()) {
    return Object.entries(nicknames)
      .map(([nickname, username]) => `${nickname}=${username}`)
      .join("\n");
  }

  function parseNicknameMapLines(input) {
    const parsed = {};
    for (const rawLine of String(input || "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const separator = line.includes("=") ? "=" : line.includes(":") ? ":" : null;
      if (!separator) throw new Error(`Use nickname=username format for: ${line}`);
      const [nicknamePart, ...usernameParts] = line.split(separator);
      const nickname = nicknamePart.trim();
      const username = normalizeNicknameUsernameList(usernameParts.join(separator));
      if (!nickname || !username) throw new Error(`Missing nickname or username for: ${line}`);
      parsed[nickname] = username;
    }
    return nicknameMapFromObject(parsed);
  }

  function parseSingleNicknameLine(input) {
    const parsed = parseNicknameMapLines(input);
    const entries = Object.entries(parsed);
    if (entries.length !== 1) throw new Error("Enter exactly one nickname=username pair.");
    return entries[0];
  }

  function regexFromUserInput(input) {
    const pattern = (input || "").trim();
    if (!pattern) return null;

    // Accept either plain regex text, e.g. New observations of|added \d+ observations,
    // or JS-style regex literals, e.g. /New observations of|added \d+ observations/i.
    const literal = pattern.match(/^\/(.*)\/([a-z]*)$/i);
    if (literal) return new RegExp(literal[1], literal[2]);
    return new RegExp(pattern, "i");
  }

  function compiledCustomRegexes() {
    return customRegexPatterns().map(pattern => {
      try {
        return { pattern, regex: regexFromUserInput(pattern) };
      } catch (err) {
        log("invalid custom regex", pattern, err);
        return null;
      }
    }).filter(Boolean);
  }

  function compiledHighlightRegexes() {
    return highlightRegexPatterns().map(pattern => {
      try {
        return { pattern, regex: regexFromUserInput(pattern) };
      } catch (err) {
        log("invalid highlight regex", pattern, err);
        return null;
      }
    }).filter(Boolean);
  }

  function loadSavedOptions() {
    CONFIG.mode = currentMode();
  }

  function log(...args) {
    if (CONFIG.debugConsole) console.info("[iNat filter]", ...args);
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      ${CARD_SELECTOR}[${FILTERED_ATTR}="true"] {
        opacity: 0.28 !important;
        filter: grayscale(1) !important;
        transition: opacity 120ms ease-in-out, filter 120ms ease-in-out;
      }
      ${CARD_SELECTOR}[${FILTERED_ATTR}="true"]:hover {
        opacity: 0.80 !important;
        filter: grayscale(0.3) !important;
      }
      ${CARD_SELECTOR}[${FILTERED_ATTR}="true"] .timeline-panel {
        background: #f3f3f3 !important;
        border-color: #ddd !important;
      }
      ${CARD_SELECTOR}[${SHRUNK_ATTR}="true"] ${BODY_SELECTOR} {
        cursor: zoom-in;
        transition: zoom 140ms ease-in-out;
      }
      .hermes-inat-expand-button {
        display: inline-block;
        margin-left: 8px;
        padding: 2px 6px;
        border: 1px solid #aaa;
        border-radius: 4px;
        background: #f7f7f7;
        color: #333;
        font-size: 11px;
        font-weight: normal;
        line-height: 1.2;
        cursor: pointer;
        vertical-align: middle;
      }
      .hermes-inat-expand-button:hover {
        background: #fff;
        border-color: #777;
      }
      ${CARD_SELECTOR}[${HIGHLIGHTED_ATTR}="true"] .timeline-panel {
        background: #fffdf0 !important;
        border-color: #f0c43c !important;
        box-shadow: 0 0 0 2px rgba(240, 196, 60, 0.36) !important;
      }
      ${CARD_SELECTOR}[${HIGHLIGHTED_ATTR}="true"] .timeline-title {
        color: #5d4a00 !important;
      }
      .hermes-inat-filter-label,
      .hermes-inat-highlight-label {
        display: inline-block;
        margin-left: 8px;
        padding: 2px 5px;
        border-radius: 4px;
        background: #777;
        color: #fff;
        font-size: 11px;
        font-weight: normal;
        vertical-align: middle;
      }
      .hermes-inat-highlight-label {
        background: #b88900;
        color: #fffdf4;
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeText(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function titleText(card) {
    const title = card.querySelector(TITLE_SELECTOR) || card;
    return normalizeText(title.textContent);
  }

  function cardText(card) {
    return normalizeText(card.textContent);
  }

  function cardClasses(card) {
    return normalizeText(card.className || "");
  }

  function matchingFilter(card) {
    const text = titleText(card);
    const fullText = cardText(card);
    const cls = cardClasses(card);
    for (const filter of FILTERS) {
      if (!isFilterEnabled(filter)) continue;
      const textMatch = filter.text && filter.text.test(text);
      const classMatch = filter.className && filter.className.test(cls);
      if (textMatch || classMatch) return { filter, text, cls };
    }

    for (const customRegex of compiledCustomRegexes()) {
      customRegex.regex.lastIndex = 0;
      if (customRegex.regex.test(text) || customRegex.regex.test(fullText)) {
        return {
          filter: { name: `Custom regex: ${customRegex.pattern}` },
          text,
          cls
        };
      }
    }

    return null;
  }

  function addCardLabel(card, className, text) {
    if (!CONFIG.addLabelsToCards) return;
    const title = card.querySelector(TITLE_SELECTOR);
    if (!title || title.querySelector(`.${className}`)) return;
    const label = document.createElement("span");
    label.className = className;
    label.textContent = text;
    title.appendChild(label);
  }

  function addDimLabel(card, reason) {
    addCardLabel(card, "hermes-inat-filter-label", `filtered: ${reason}`);
  }

  function addHighlightLabel(card, reason) {
    addCardLabel(card, "hermes-inat-highlight-label", `highlight: ${reason}`);
  }

  function addShrinkLabel(card, reason) {
    addCardLabel(card, "hermes-inat-filter-label", `shrunk: ${reason}`);
  }

  function addExpandButton(card) {
    const title = card.querySelector(TITLE_SELECTOR);
    if (!title || title.querySelector(".hermes-inat-expand-button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hermes-inat-expand-button";
    button.textContent = "expand";
    title.appendChild(button);
  }

  function shrinkCard(card, reason) {
    const body = card.querySelector(BODY_SELECTOR);
    if (!body) {
      addShrinkLabel(card, reason);
      addExpandButton(card);
      return;
    }

    const originalHeight = body.scrollHeight;
    if (originalHeight) card.setAttribute(ORIGINAL_BODY_HEIGHT_ATTR, String(originalHeight));

    card.setAttribute(SHRUNK_ATTR, "true");
    // CSS transform only changes visual pixels, not layout. CSS zoom changes
    // layout and pixels, so the panel shrinks in both x and y while also
    // reducing vertical space.
    body.style.zoom = "0.3";
    body.style.maxHeight = "";
    body.style.width = "";
    addShrinkLabel(card, reason);
    addExpandButton(card);
  }

  function expandShrunkCard(card) {
    const body = card.querySelector(BODY_SELECTOR);
    if (body) {
      body.style.zoom = "";
      body.style.maxHeight = "";
      body.style.width = "";
      body.style.transform = "";
    }
    card.removeAttribute(FILTERED_ATTR);
    card.removeAttribute(REASON_ATTR);
    card.removeAttribute(SHRUNK_ATTR);
    card.removeAttribute(ORIGINAL_BODY_HEIGHT_ATTR);
    card.querySelectorAll(".hermes-inat-filter-label, .hermes-inat-expand-button").forEach(label => label.remove());
  }

  function filterCard(card, match) {
    if (card.getAttribute(FILTERED_ATTR) === "true") return false;

    card.setAttribute(FILTERED_ATTR, "true");
    card.setAttribute(REASON_ATTR, match.filter.name);

    if (currentMode() === "remove") {
      card.remove();
    } else if (currentMode() === "collapse") {
      card.style.display = "none";
    } else if (currentMode() === "shrink") {
      shrinkCard(card, match.filter.name);
    } else {
      addDimLabel(card, match.filter.name);
    }

    log("matched update", {
      mode: currentMode(),
      filter: match.filter.name,
      className: match.cls,
      title: match.text
    });
    return true;
  }

  function resetFilteredCards() {
    // Needed when toggling filters/modes. Previously dimmed/collapsed cards may no
    // longer match the active options. Removed cards cannot be restored without
    // reloading iNat's page, so "remove" mode remains intentionally advanced.
    for (const card of document.querySelectorAll(`${CARD_SELECTOR}[${FILTERED_ATTR}="true"]`)) {
      card.removeAttribute(FILTERED_ATTR);
      card.removeAttribute(REASON_ATTR);
      card.style.display = "";
      card.removeAttribute(SHRUNK_ATTR);
      card.removeAttribute(ORIGINAL_BODY_HEIGHT_ATTR);
      const body = card.querySelector(BODY_SELECTOR);
      if (body) {
        body.style.zoom = "";
        body.style.maxHeight = "";
        body.style.width = "";
        body.style.transform = "";
      }
      card.querySelectorAll(".hermes-inat-filter-label, .hermes-inat-expand-button").forEach(label => label.remove());
    }
  }

  function resetHighlightedCards() {
    for (const card of document.querySelectorAll(`${CARD_SELECTOR}[${HIGHLIGHTED_ATTR}="true"]`)) {
      card.removeAttribute(HIGHLIGHTED_ATTR);
      card.removeAttribute(HIGHLIGHT_REASON_ATTR);
      card.querySelectorAll(".hermes-inat-highlight-label").forEach(label => label.remove());
    }
  }

  function resetAllMarkedCards() {
    resetFilteredCards();
    resetHighlightedCards();
  }

  function applyHighlights() {
    installStyle();
    const regexes = compiledHighlightRegexes();
    resetHighlightedCards();
    if (regexes.length === 0) {
      scheduleBadgeUpdate();
      return 0;
    }

    const cards = Array.from(document.querySelectorAll(CARD_SELECTOR));
    let highlighted = 0;
    for (const card of cards) {
      const text = titleText(card);
      const fullText = cardText(card);
      const match = regexes.find(item => {
        item.regex.lastIndex = 0;
        return item.regex.test(text) || item.regex.test(fullText);
      });
      if (!match) continue;
      card.setAttribute(HIGHLIGHTED_ATTR, "true");
      card.setAttribute(HIGHLIGHT_REASON_ATTR, match.pattern);
      addHighlightLabel(card, match.pattern);
      highlighted += 1;
    }
    scheduleBadgeUpdate();
    log(`highlight pass complete: ${highlighted}/${cards.length} highlighted`);
    return highlighted;
  }

  function applyFilters() {
    installStyle();
    const container = document.querySelector(UPDATE_CONTAINER_SELECTOR);
    if (!container) {
      log("updates container not found yet");
      scheduleBadgeUpdate();
      return 0;
    }

    const cards = Array.from(document.querySelectorAll(CARD_SELECTOR));
    let newlyFiltered = 0;
    for (const card of cards) {
      const match = matchingFilter(card);
      if (match && filterCard(card, match)) newlyFiltered += 1;
    }
    applyHighlights();
    scheduleBadgeUpdate();
    log(`pass complete: ${newlyFiltered} new, ${filteredCount()}/${cards.length} total matched`);
    return newlyFiltered;
  }

  function filteredCount() {
    return document.querySelectorAll(`${CARD_SELECTOR}[${FILTERED_ATTR}="true"]`).length;
  }

  function highlightedCount() {
    return document.querySelectorAll(`${CARD_SELECTOR}[${HIGHLIGHTED_ATTR}="true"]`).length;
  }

  function totalCardCount() {
    return document.querySelectorAll(CARD_SELECTOR).length;
  }

  function cardSignature(card) {
    // "More" on iNat can replace the whole list with a fresh set of cards, so
    // count-based detection is not reliable. Use a compact identity based on
    // stable-ish visible/link content instead. This intentionally ignores our
    // own filter attributes/labels/styles.
    const title = titleText(card);
    const links = Array.from(card.querySelectorAll("a[href]"))
      .map(a => a.href)
      .filter(Boolean)
      .slice(0, 8)
      .join("|");
    const classes = cardClasses(card);
    return `${title}\n${links}\n${classes}`;
  }

  function currentCardSignatures() {
    return new Set(Array.from(document.querySelectorAll(CARD_SELECTOR)).map(cardSignature));
  }

  function makeBadge() {
    if (!CONFIG.showDebugBadge || !document.body) return null;
    let badge = document.getElementById(BADGE_ID);
    if (badge) return badge;
    badge = document.createElement("div");
    badge.id = BADGE_ID;
    badge.style.cssText = [
      "position: fixed",
      "right: 12px",
      "bottom: 12px",
      "z-index: 2147483647",
      "padding: 7px 9px",
      "border-radius: 6px",
      "background: rgba(0,0,0,0.72)",
      "color: white",
      "font: 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      "box-shadow: 0 2px 8px rgba(0,0,0,0.25)",
      "cursor: default",
      "pointer-events: none"
    ].join("; ");
    document.body.appendChild(badge);
    return badge;
  }

  function updateBadge() {
    const badge = makeBadge();
    if (!badge) return;
    const enabled = FILTERS.filter(isFilterEnabled).map(f => f.name);
    const custom = customRegexPatterns();
    const highlight = highlightRegexPatterns();
    const nicknames = nicknameMap();
    const nicknameEntries = Object.entries(nicknames);
    const enabledCount = enabled.length + custom.length;
    badge.textContent = `iNat filter: ${filteredCount()}/${totalCardCount()} matched; ${highlightedCount()} highlighted; ${enabledCount} filter(s); ${nicknameEntries.length} nickname(s); ${currentMode()}`;
    badge.title = [
      ...enabled,
      ...custom.map(pattern => `Custom regex: ${pattern}`),
      ...highlight.map(pattern => `Highlight regex: ${pattern}`),
      ...nicknameEntries.map(([nickname, username]) => `Nickname: ${nickname} = ${username}`)
    ].join("\n") || "No filters or nicknames enabled. Edit the userscript FILTERS list or set a custom/highlight regex/nickname.";
  }

  function scheduleBadgeUpdate() {
    if (badgeUpdateTimer) return;
    badgeUpdateTimer = window.setTimeout(() => {
      badgeUpdateTimer = null;
      updateBadge();
    }, 100);
  }

  function registerMenus() {
    if (typeof GM_registerMenuCommand !== "function") return;
    const MENU_HEADER_LINE_DASHES = 23;
    const MENU_HEADER_PREFIX_WIDTH = 6;
    const MENU_HEADER_SUFFIX_DASHES = {
      "Hide/Highlight by regex": 6,
      "Built-in filters": 10,
      "Dimming modes": 9,
      "Nicknames": 13
    };
    function menuHeader(label) {
      if (!label) return "─".repeat(MENU_HEADER_LINE_DASHES);
      const prefix = `${"─".repeat(MENU_HEADER_PREFIX_WIDTH)} `;
      const suffix = "─".repeat(MENU_HEADER_SUFFIX_DASHES[label] || 6);
      return `${prefix}${label} ${suffix}`;
    }
    const registerMenuHeader = label => GM_registerMenuCommand(menuHeader(label), () => {});
    const registerMenuLine = () => GM_registerMenuCommand(menuHeader(""), () => {});

    GM_registerMenuCommand("Show current status", () => {
      const builtIn = FILTERS.filter(isFilterEnabled).map(f => `• ${f.menuLabel || f.name}`);
      const dimming = customRegexPatterns();
      const highlighting = highlightRegexPatterns();
      const nicknames = Object.entries(nicknameMap());
      const dimmingText = dimming.length ? dimming.map(pattern => `• ${pattern}`).join("\n") : "None";
      const highlightingText = highlighting.length ? highlighting.map(pattern => `• ${pattern}`).join("\n") : "None";
      const nicknameText = nicknames.length ? nicknames.map(([nickname, username]) => `• ${nickname} = ${username}`).join("\n") : "None";
      alert(`Built-in filters:\n${builtIn.join("\n") || "None"}\n\nDimming regexes:\n${dimmingText}\n\nHighlighting regexes:\n${highlightingText}\n\nNicknames:\n${nicknameText}\n\nMatched cards: ${filteredCount()}/${totalCardCount()}\nHighlighted cards: ${highlightedCount()}/${totalCardCount()}\nDimming mode: ${currentMode()}`);
    });
    registerMenuHeader("Hide/Highlight by regex");
    GM_registerMenuCommand("Show current regexes", () => {
      const dimming = customRegexPatterns();
      const highlighting = highlightRegexPatterns();
      const dimmingText = dimming.length ? dimming.map((pattern, i) => `${i + 1}. ${pattern}`).join("\n") : "None";
      const highlightingText = highlighting.length ? highlighting.map((pattern, i) => `${i + 1}. ${pattern}`).join("\n") : "None";
      alert(`Dimming regexes:\n${dimmingText}\n\nHighlighting regexes:\n${highlightingText}`);
    });
    GM_registerMenuCommand("Add new: Dim by regex", () => {
      const input = prompt(
        "Enter a new JavaScript regex for cards to dim/hide/remove.\n\nExamples:\nNew observations of|added \\d+ observations\n/New observations of|added \\d+ observations/i\n\nThis adds another regex. Leave blank to cancel.",
        ""
      );
      if (input === null) return;
      const trimmed = input.trim();
      if (!trimmed) return;
      if (trimmed) {
        try {
          regexFromUserInput(trimmed);
        } catch (err) {
          alert(`Invalid regex:\n${err.message}`);
          return;
        }
      }
      addCustomRegexPattern(trimmed);
      resetAllMarkedCards();
      applyFilters();
      alert(`Dimming regex added:\n${trimmed}`);
    });
    GM_registerMenuCommand("Clear all dimming regexes", () => {
      clearCustomRegexPatterns();
      resetAllMarkedCards();
      applyFilters();
      alert("All dimming regexes cleared.");
    });
    GM_registerMenuCommand("Add new: Highlight by regex", () => {
      const input = prompt(
        "Enter a new JavaScript regex for cards to highlight.\n\nExamples:\nImportant taxon|favorite\n/important|favorite/i\n\nThis adds another regex. Leave blank to cancel.",
        ""
      );
      if (input === null) return;
      const trimmed = input.trim();
      if (!trimmed) return;
      if (trimmed) {
        try {
          regexFromUserInput(trimmed);
        } catch (err) {
          alert(`Invalid regex:\n${err.message}`);
          return;
        }
      }
      addHighlightRegexPattern(trimmed);
      applyHighlights();
      alert(`Highlighting regex added:\n${trimmed}`);
    });
    GM_registerMenuCommand("Clear all highlighting regexes", () => {
      clearHighlightRegexPatterns();
      resetHighlightedCards();
      updateBadge();
      alert("All highlighting regexes cleared.");
    });
    registerMenuHeader("Nicknames");
    GM_registerMenuCommand("Show current nicknames", () => {
      const lines = nicknameMapLines();
      alert(`Nicknames:\n${lines || "None"}\n\nThese are saved mappings only. They do not change page behavior yet.`);
    });
    GM_registerMenuCommand("Add new: Nickname", () => {
      const input = prompt(
        "Enter one nickname mapping as nickname=username. Usernames can be comma-separated. @ is added automatically.\n\nExamples:\ntom=tom1548\nsc=sbrobeson, carnifex\n\nThis adds or replaces one nickname. It does not change page behavior yet. Leave blank to cancel.",
        ""
      );
      if (input === null) return;
      const trimmed = input.trim();
      if (!trimmed) return;
      try {
        const [nickname, username] = parseSingleNicknameLine(trimmed);
        addNickname(nickname, username);
        updateBadge();
        alert(`Nickname saved:\n${nickname} = ${username}\n\nThis mapping is stored for future nickname behavior; it does not change the page yet.`);
      } catch (err) {
        alert(`Invalid nickname mapping:\n${err.message}`);
      }
    });
    GM_registerMenuCommand("Edit all nicknames", () => {
      const input = prompt(
        "Edit nickname mappings, one per line, as nickname=username. Usernames can be comma-separated. @ is added automatically.\n\nExamples:\ntom=tom1548\nsc=sbrobeson, carnifex\n\nThese mappings are stored only; they do not change page behavior yet.",
        nicknameMapLines()
      );
      if (input === null) return;
      try {
        setNicknameMap(parseNicknameMapLines(input));
        updateBadge();
        alert("Nicknames saved. These mappings are stored for future nickname behavior; they do not change the page yet.");
      } catch (err) {
        alert(`Invalid nickname mappings:\n${err.message}`);
      }
    });
    GM_registerMenuCommand("Clear all nicknames", () => {
      clearNicknames();
      updateBadge();
      alert("All nicknames cleared.");
    });
    registerMenuHeader("Built-in filters");
    for (const filter of FILTERS) {
      const enabled = isFilterEnabled(filter);
      const label = `${enabled ? "✓ " : ""}${filter.menuLabel || filter.name}`;
      GM_registerMenuCommand(label, () => {
        const newEnabled = !isFilterEnabled(filter);
        setFilterEnabled(filter, newEnabled);
        resetAllMarkedCards();
        applyFilters();
        alert(`${filter.menuLabel || filter.name} is now ${newEnabled ? "on" : "off"}.\n\nReload the page if you want the Tampermonkey/Greasemonkey menu text itself to refresh.`);
      });
    }
    registerMenuHeader("Dimming modes");
    for (const mode of ["dim", "shrink", "collapse", "remove"]) {
      GM_registerMenuCommand(`${mode}${currentMode() === mode ? " ✓" : ""}`, () => {
        setCurrentMode(mode);
        resetAllMarkedCards();
        applyFilters();
        alert(`Mode is now ${mode}.\n\ndim = grey cards\nshrink = dim card + zoom timeline-body to 30% in x/y; click Expand/body to restore\ncollapse = display:none\nremove = delete nodes`);
      });
    }
    registerMenuLine();
    GM_registerMenuCommand("Rerun filters", () => {
      const n = applyFilters();
      alert(`Re-ran filters. Newly matched: ${n}. Total matched: ${filteredCount()}/${totalCardCount()}.`);
    });
  }

  function waitForCardsAndApply() {
    // Initial load: wait for iNat to put the first update cards in the DOM.
    const existingCards = document.querySelectorAll(CARD_SELECTOR);
    if (existingCards.length > 0) {
      applyFilters();
      return;
    }
    waitForNewCardsAndApply(new Set(), "initial load");
  }

  function waitForNewCardsAndApply(previousSignatures, reason, afterApply) {
    // After clicking More, iNat may delete the current list and then insert a
    // replacement list with the same number of cards. Count-based detection is
    // therefore unreliable. Wait until at least one card appears whose signature
    // was not present before the click. The observer is narrow and temporary.
    const container = document.querySelector(UPDATE_CONTAINER_SELECTOR) || document.body;
    let done = false;

    function newWorkIsAvailable() {
      const cards = Array.from(document.querySelectorAll(CARD_SELECTOR));
      if (cards.length === 0) return false;
      return cards.some(card => !previousSignatures.has(cardSignature(card)));
    }

    if (newWorkIsAvailable()) {
      applyFilters();
      if (typeof afterApply === "function") afterApply();
      return;
    }

    const observer = new MutationObserver(() => {
      if (done) return;
      if (!newWorkIsAvailable()) return;
      done = true;
      observer.disconnect();
      log(`new cards detected after ${reason}`);
      applyFilters();
      if (typeof afterApply === "function") afterApply();
    });

    observer.observe(container, { childList: true, subtree: true });

    // Safety cutoff: if iNat never inserts new cards, stop observing so we
    // cannot contribute to an unresponsive page.
    window.setTimeout(() => {
      if (done) return;
      done = true;
      observer.disconnect();
      updateBadge();
      log(`stopped waiting after ${reason}: no unseen cards appeared`);
    }, 15000);
  }

  function scrollToPageTop() {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    } catch (_) {
      window.scrollTo(0, 0);
    }
  }

  function start() {
    loadSavedOptions();
    log("starting v0.8.2");
    registerMenus();

    waitForCardsAndApply();

    // Click a shrunk card body or its Expand button to restore original size.
    document.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      const clickedExpandButton = target ? target.closest(".hermes-inat-expand-button") : null;
      const body = target ? target.closest(`${CARD_SELECTOR}[${SHRUNK_ATTR}="true"] ${BODY_SELECTOR}`) : null;
      if (!clickedExpandButton && !body) return;
      const card = (clickedExpandButton || body).closest(CARD_SELECTOR);
      if (!card) return;
      expandShrunkCard(card);
      scheduleBadgeUpdate();
    }, true);

    // Re-run after clicks on More / dashboard tabs. Record the current card
    // signatures before iNat's click handler runs, scroll immediately for More,
    // then wait for an unseen card so filtering can run after iNat updates the list.
    document.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target.closest("#more_pagination, .dashboard_tab, .btn_expand") : null;
      if (!target) return;
      const beforeSignatures = currentCardSignatures();
      const isMoreButton = target.matches("#more_pagination");
      if (isMoreButton) scrollToPageTop();
      waitForNewCardsAndApply(
        beforeSignatures,
        target.id || target.className || "click",
        null
      );
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
