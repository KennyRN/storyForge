import { addIcon } from "obsidian";

export const ICON_UNPLACED = "sf-archive-drawer";
export const ICON_ARCHIVE = "sf-box";
export const ICON_UNARCHIVE = "sf-inbox-download";
export const ICON_CODEX = "sf-earth-fill";
export const ICON_SERIES = "sf-library";
export const ICON_FILTER = "sf-filter";
export const ICON_BOOK_PLUS = "sf-book-plus";
export const ICON_DASHBOARD_CHART = "sf-dashboard-chart";
export const ICON_EXCHANGE = "sf-exchange-b";
export const ICON_CALENDAR = "sf-calendar-2";
export const ICON_TOOLS = "sf-list-rounded";
export const ICON_FOLDER_PLUS = "sf-folder-plus";
export const ICON_PLUS_SQUARE = "sf-plus-square";
export const ICON_MINUS_SQUARE = "sf-minus-square";
export const ICON_CHECK_SQUARE = "sf-check-square";
export const ICON_TIMELINE = "sf-timeline";
export const ICON_NOTEBOOK = "sf-notebook";
export const ICON_STORYTELLING = "sf-storytelling-book";
export const ICON_CYCLE_ALT = "sf-cycle-alt";
export const ICON_TEXT_STYLE = "sf-text-style";
export const ICON_UI_FORMATTING = "sf-ui-formatting";
export const ICON_HIDE_UI = "sf-hide-ui";
export const ICON_PROTECTIONS = "sf-protections";
export const ICON_PERSON_FILL = "sf-person-fill";
export const ICON_PERSON_FILL_ADD = "sf-person-fill-add";
export const ICON_PERSON_2_FILL = "sf-person-2-fill";
export const ICON_MAP_PIN = "sf-map-pin";
export const ICON_MAP_PIN_PLUS = "sf-map-pin-plus";
export const ICON_FORGE = "sf-hammer-anvil";
export const ICON_FILE_PLUS = "sf-file-plus";
export const ICON_EYE = "sf-eye";
export const ICON_MULTIPLY_SQUARE = "sf-multiply-square";

// Tag/type icon catalog additions (src/iconRegistry.ts's CODEX_ICON_CATALOG / TAG_ICON_CATALOG) —
// picked from the settings UI for Codex types, chapter tags, and novel tags, not wired to any
// single fixed UI button.
export const ICON_NUMBER_CIRCLE_0 = "sf-number-circle-0";
export const ICON_NUMBER_CIRCLE_1 = "sf-number-circle-1";
export const ICON_NUMBER_CIRCLE_2 = "sf-number-circle-2";
export const ICON_NUMBER_CIRCLE_3 = "sf-number-circle-3";
export const ICON_NUMBER_CIRCLE_4 = "sf-number-circle-4";
export const ICON_NUMBER_CIRCLE_5 = "sf-number-circle-5";
export const ICON_NUMBER_CIRCLE_6 = "sf-number-circle-6";
export const ICON_NUMBER_CIRCLE_7 = "sf-number-circle-7";
export const ICON_NUMBER_CIRCLE_8 = "sf-number-circle-8";
export const ICON_NUMBER_CIRCLE_9 = "sf-number-circle-9";
export const ICON_EYE_OUTLINE = "sf-eye-outline";
export const ICON_EXCLAMATION_SQUARE = "sf-exclamation-square";
export const ICON_EXCLAMATION_SQUARE_FILL = "sf-exclamation-square-fill";
export const ICON_INFO_CIRCLE = "sf-info-circle";
export const ICON_EDIT_PEN = "sf-edit-pen";
export const ICON_VERIFIED_CHECK = "sf-verified-check";
export const ICON_VERIFIED_CHECK_FILL = "sf-verified-check-fill";
export const ICON_STARS_FILL = "sf-stars-fill";
export const ICON_SHOP = "sf-shop";
export const ICON_SETTINGS_GEAR = "sf-settings-gear";
export const ICON_FIRE = "sf-fire";
export const ICON_CROWN = "sf-crown";
export const ICON_CALENDAR_PLAIN = "sf-calendar-plain";
export const ICON_BUILDING_A = "sf-building-a";
export const ICON_BUILDING_B = "sf-building-b";
export const ICON_BOOKMARK = "sf-bookmark";
export const ICON_BOOKMARK_FILL = "sf-bookmark-fill";
export const ICON_CHECK_CIRCLE = "sf-check-circle";
export const ICON_FLAG = "sf-flag";
export const ICON_FLAG_FILL = "sf-flag-fill";
export const ICON_STAR_OUTLINE = "sf-star-outline";
export const ICON_STAR_FILL = "sf-star-fill";
export const ICON_STAR_DUOTONE = "sf-star-duotone";
export const ICON_LOCK = "sf-lock";
export const ICON_HEART_CIRCLE = "sf-heart-circle";
export const ICON_HEART_CIRCLE_FILL = "sf-heart-circle-fill";
export const ICON_HEART_OUTLINE = "sf-heart-outline";
export const ICON_HEART_FILL = "sf-heart-fill";
export const ICON_CHECK_CIRCLE_FILL = "sf-check-circle-fill";
export const ICON_MESSAGE = "sf-message";
export const ICON_TAG = "sf-tag";

/** Codex-focus navigator's transport row (hand-off brief H1 — outline set chosen). */
export const ICON_TRANSPORT_TO_START = "sf-transport-to-start";
export const ICON_TRANSPORT_PREVIOUS = "sf-transport-previous";
export const ICON_TRANSPORT_NEXT = "sf-transport-next";
export const ICON_TRANSPORT_TO_END = "sf-transport-to-end";

const TRANSPORT_TO_START_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" d="M256 448c106 0 192-86 192-192S362 64 256 64S64 150 64 256s86 192 192 192Z" /><path fill="currentColor" d="M192 176a16 16 0 0 1 16 16v53l111.68-67.46a10.78 10.78 0 0 1 16.32 9.33v138.26a10.78 10.78 0 0 1-16.32 9.31L208 267v53a16 16 0 0 1-32 0V192a16 16 0 0 1 16-16" /></svg>`;
const TRANSPORT_PREVIOUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z" fill="none" /><path fill="currentColor" d="m273.77 169.57l-89.09 74.13a16 16 0 0 0 0 24.6l89.09 74.13A16 16 0 0 0 300 330.14V181.86a16 16 0 0 0-26.23-12.29" /><path fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192s192-86 192-192Z" /></svg>`;
const TRANSPORT_NEXT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z" fill="none" /><path fill="currentColor" d="m238.23 342.43l89.09-74.13a16 16 0 0 0 0-24.6l-89.09-74.13A16 16 0 0 0 212 181.86v148.28a16 16 0 0 0 26.23 12.29" /><path fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192s192-86 192-192Z" /></svg>`;
const TRANSPORT_TO_END_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192s192-86 192-192Z" /><path fill="currentColor" d="M320 176a16 16 0 0 0-16 16v53l-111.68-67.44a10.78 10.78 0 0 0-16.32 9.31v138.26a10.78 10.78 0 0 0 16.32 9.31L304 267v53a16 16 0 0 0 32 0V192a16 16 0 0 0-16-16" /></svg>`;

/** Codex-focus navigator's "continue the story" tile — duotone circle so it reads as an
 * affordance rather than a chapter row, coloured via currentColor from the tile's own text colour. */
export const ICON_ADD_CIRCLE = "sf-add-circle";
const ADD_CIRCLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2" opacity=".3" /><path fill="currentColor" d="M12 7a1 1 0 0 0-.993.883L11 8v3H8a1 1 0 0 0-.117 1.993L8 13h3v3a1 1 0 0 0 1.993.117L13 16v-3h3a1 1 0 0 0 .117-1.993L16 11h-3V8a1 1 0 0 0-1-1" /></svg>`;

/** The layout selector button's glyph (TopPanel.ts) — replaces the generic lucide "layout-grid". */
export const ICON_LAYOUT_SELECTOR = "sf-layout-selector";
export const ICON_TAG_EDIT = "sf-tag-edit";
const LAYOUT_SELECTOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M11 21H5a2 2 0 0 1-2-2v-3h8zm0-18v5H3V5a2 2 0 0 1 2-2zm0 11H3v-4h8zm8-11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6V3z" /></svg>`;

/** "material-symbols--filter-list-rounded" — the Codex tree's type-filter button (BottomPanel.ts).
 * Distinct from ICON_FILTER's funnel-lines glyph (used for series/book settings elsewhere). */
export const ICON_FILTER_LIST = "sf-filter-list";
const FILTER_LIST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M11 18q-.425 0-.712-.288T10 17t.288-.712T11 16h2q.425 0 .713.288T14 17t-.288.713T13 18zm-4-5q-.425 0-.712-.288T6 12t.288-.712T7 11h10q.425 0 .713.288T18 12t-.288.713T17 13zM4 8q-.425 0-.712-.288T3 7t.288-.712T4 6h16q.425 0 .713.288T21 7t-.288.713T20 8z" /></svg>`;

/** "pinhead--open-book" — marks the currently open/selected novel in the Series tab's book list,
 * and prefixes the "Detailed" layout tab's label (both places where an open novel with its
 * full chapter breakdown is what the icon is standing in for). Coloured via currentColor so it
 * always matches whatever text colour it sits beside. */
export const ICON_BOOK_OPEN = "sf-book-open";
const BOOK_OPEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15"><path d="M0 0h15v15H0z" fill="none" /><path fill="currentColor" d="M.09 10.16c-.1-.08-.09-.22-.09-.22l.61-7.17s.01-.08.05-.11q.015-.06.09-.09c.61-.24 3.92-2.03 5.6-.37c.27.32.57.79.57 1.15v6.06s.01.13-.11.21c-.03.02-.14.07-.28 0c-2.57-1.27-5.43.17-6.16.56c-.14.07-.25-.01-.28-.02m14.54.02c-.73-.38-3.59-1.83-6.16-.56c-.14.07-.25.01-.28 0c-.12-.08-.11-.21-.11-.21V3.35c0-.36.3-.83.57-1.15c1.68-1.66 4.97.13 5.58.37c.05.02.08.05.1.08c.04.04.05.12.05.12L15 9.94s.01.14-.09.22c-.03.01-.14.09-.28.02m-5.56 3.13c.05-.01.11-.04.14-.09c.02-.04.04-.07.04-.13c.06-1.07 1.87-2.07 5.37-.03c.09.05.2.05.28-.02c.1-.07.1-.19.1-.19v-.63s0-.09-.03-.13a.6.6 0 0 0-.11-.11c-2.34-1.5-5.29-2.18-6.79-.18c-.03.04-.05.07-.09.1c-.05.05-.13.05-.13.05h-.68s-.09 0-.15-.05c-.05-.03-.06-.06-.09-.1c-1.5-2-4.45-1.35-6.79.15c-.05.02-.08.06-.11.1c-.03.05-.03.14-.03.14v.63s0 .13.09.19c.09.07.2.07.28.03c3.48-2.04 5.31-1.01 5.36.07c0 .05.03.08.05.12s.09.08.14.09c.84.2 2.05.28 3.15-.01" /></svg>`;

/** "glyphs--book-spine-bold" — a single closed book viewed from the spine (front/back cover +
 * spine outline), the Novel tab's leading tab icon — a single book, as distinct from the Series
 * tab's shelf-of-books ICON_SERIES and the Detailed tab's open-book ICON_BOOK_OPEN. */
export const ICON_BOOK_SPINE = "sf-book-spine";
const BOOK_SPINE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path d="M0 0h80v80H0z" fill="none" /><g fill="none"><path fill="currentColor" d="M33 13a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3.998H33zm0 9.998h14v34H33zm0 40V67a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4.002z" /><path stroke="currentColor" stroke-linejoin="round" stroke-width="3" d="M33 13a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3.998H33zm0 9.998h14v34H33zm0 40V67a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4.002z" /></g></svg>`;

// "fluent--tag-edit-24-filled" — a filled price-tag with a pencil-cut corner, ribbon icon for "Tags & Codex types".
const TAG_EDIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M19.75 2A2.25 2.25 0 0 1 22 4.25v5.462c0 .362-.06.717-.175 1.053a3.286 3.286 0 0 0-4.431.197l-5.903 5.903a3.7 3.7 0 0 0-.97 1.712l-.457 1.83a2.1 2.1 0 0 0 .007 1.052a3.24 3.24 0 0 1-2.12-.945L3.489 16.06a3.25 3.25 0 0 1-.004-4.596l8.5-8.51a3.25 3.25 0 0 1 2.3-.953zM17 5.502a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3m1.1 6.167l-5.903 5.903a2.7 2.7 0 0 0-.706 1.247l-.458 1.831a1.087 1.087 0 0 0 1.319 1.318l1.83-.457a2.7 2.7 0 0 0 1.248-.707l5.902-5.902A2.286 2.286 0 0 0 18.1 11.67" /></svg>`;

/** Codex-focus navigator's fifth control — the continuous read-and-write mode toggle (hand-off
 * brief §4 hold point, resolved). Shown while the mode is off, set apart from the four transport
 * buttons rather than reading as a fifth step among them. */
export const ICON_CONTINUOUS_MODE = "sf-continuous-mode";
// viewBox is -3 -3 32 32, not the artwork's own 0 0 26 26 — this ring runs edge-to-edge in its
// native box (touches all four sides), unlike the four transport icons' rings, which are inset by
// design (r=192 of a 256 box). Padding the box to 32 so the 26-unit artwork occupies 81.25% of it
// matches the transport set's 208/256 = 81.25% painted fraction exactly, so all five read as the
// same size at the shared CSS box size — see iconRegistry.ts's standing rule on painted fraction.
const CONTINUOUS_MODE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -3 32 32"><path d="M-3 -3h32v32H-3z" fill="none" /><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M5 11a1 1 0 0 1 1-1h10.308a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1m0-4a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1m0 8a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1m0 4a1 1 0 0 1 1-1h10.308a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1" /><path d="M13 24c6.075 0 11-4.925 11-11S19.075 2 13 2S2 6.925 2 13s4.925 11 11 11m0 2c7.18 0 13-5.82 13-13S20.18 0 13 0S0 5.82 0 13s5.82 13 13 13" /></g></svg>`;

/** The same toggle, shown once continuous mode is active — clicking it is the "cancel" action
 * that drops the reader back into the single-chapter editor (hand-off brief §2.4). Same padded
 * viewBox as ICON_CONTINUOUS_MODE, same reason. */
export const ICON_CONTINUOUS_MODE_EXIT = "sf-continuous-mode-exit";
const CONTINUOUS_MODE_EXIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -3 32 32"><path d="M-3 -3h32v32H-3z" fill="none" /><g fill="currentColor"><path fill-rule="evenodd" d="M5 11a1 1 0 0 1 1-1h10.308a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1m0-4a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1m0 8a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1m0 4a1 1 0 0 1 1-1h10.308a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1" clip-rule="evenodd" /><path d="M4.293 5.707a1 1 0 0 1 1.414-1.414l16 16a1 1 0 0 1-1.414 1.414z" /><path fill-rule="evenodd" d="M13 24c6.075 0 11-4.925 11-11S19.075 2 13 2S2 6.925 2 13s4.925 11 11 11m0 2c7.18 0 13-5.82 13-13S20.18 0 13 0S0 5.82 0 13s5.82 13 13 13" clip-rule="evenodd" /></g></svg>`;

const INBOX_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.75 12H6a2 2 0 0 1 2 2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2a2 2 0 0 1 2-2h3.25" /><path d="M15.25 2.75h-6.5a6 6 0 0 0-6 6v6.5a6 6 0 0 0 6 6h6.5a6 6 0 0 0 6-6v-6.5a6 6 0 0 0-6-6Z" /></g></svg>`;

const BOX_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.382 8.813v8.5c0 .845.344 1.656.957 2.253a3.3 3.3 0 0 0 2.308.934h8.706c.866 0 1.696-.336 2.308-.934a3.15 3.15 0 0 0 .957-2.253v-8.5m0-5.313H4.382c-.901 0-1.632.714-1.632 1.594v2.125c0 .88.73 1.593 1.632 1.593h15.236c.901 0 1.632-.713 1.632-1.593V5.094c0-.88-.73-1.594-1.632-1.594" /></svg>`;

const ARROW_OUT_UP_SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M13 16V9h4l-5-6l-5 6h4v7z" /><path fill="currentColor" d="M19 19H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2z" /></svg>`;

const EARTH_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="currentColor" d="M21.95 10.105v-.15a10.27 10.27 0 0 0-10-8.19a10.14 10.14 0 0 0-7 2.78l-.21.19a.1.1 0 0 0 0 .05a10.23 10.23 0 0 0 6.86 17.45h.4a10.26 10.26 0 0 0 10.25-10.25a10 10 0 0 0-.3-1.88m-9.94 10.66a12.2 12.2 0 0 1-.61-3.44c.11-1.52-1.21-1.66-1.78-1.72c-.86-.09-1.43-.15-1.43-1.88c.029-.898.119-1.794.27-2.68c.33-2.3.7-4.86-1.72-6.11a8.72 8.72 0 0 1 5.14-1.67a8.6 8.6 0 0 1 2 .23a3.6 3.6 0 0 1-.18 1.49c-1.16.33-1.18 1.85-1.2 3.62c.043.983-.058 1.967-.3 2.92a1.9 1.9 0 0 0 .76 2.38c.545.32 1.168.482 1.8.47a3.72 3.72 0 0 0 2.67-1.05a4 4 0 0 0 1.12-2.19q.045-.162.06-.33a.7.7 0 0 1 .29 0c.28 0 .65 0 1 .06h.62a8.72 8.72 0 0 1-8.54 9.9z"/></svg>`;

const LIBRARY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z" fill="none"/><path fill="currentColor" d="M64 480H48a32 32 0 0 1-32-32V112a32 32 0 0 1 32-32h16a32 32 0 0 1 32 32v336a32 32 0 0 1-32 32m176-304a32 32 0 0 0-32-32h-64a32 32 0 0 0-32 32v28a4 4 0 0 0 4 4h120a4 4 0 0 0 4-4ZM112 448a32 32 0 0 0 32 32h64a32 32 0 0 0 32-32v-30a2 2 0 0 0-2-2H114a2 2 0 0 0-2 2Z"/><rect width="128" height="144" x="112" y="240" fill="currentColor" rx="2" ry="2"/><path fill="currentColor" d="M320 480h-32a32 32 0 0 1-32-32V64a32 32 0 0 1 32-32h32a32 32 0 0 1 32 32v384a32 32 0 0 1-32 32m175.89-34.55l-32.23-340c-1.48-15.65-16.94-27-34.53-25.31l-31.85 3c-17.59 1.67-30.65 15.71-29.17 31.36l32.23 340c1.48 15.65 16.94 27 34.53 25.31l31.85-3c17.59-1.67 30.65-15.71 29.17-31.36"/></svg>`;

const FILTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="1.5" d="M21.25 12H8.895m-4.361 0H2.75m18.5 6.607h-5.748m-4.361 0H2.75m18.5-13.214h-3.105m-4.361 0H2.75m13.214 2.18a2.18 2.18 0 1 0 0-4.36a2.18 2.18 0 0 0 0 4.36Zm-9.25 6.607a2.18 2.18 0 1 0 0-4.36a2.18 2.18 0 0 0 0 4.36Zm6.607 6.608a2.18 2.18 0 1 0 0-4.361a2.18 2.18 0 0 0 0 4.36Z"/></svg>`;

const BOOK_PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 20.25c0 .414.336.75.75.75h10.652C17.565 21 18 20.635 18 19.4v-1.445M5 20.25A2.25 2.25 0 0 1 7.25 18h10.152q.339 0 .598-.045M5 20.25V6.2c0-1.136-.072-2.389 1.092-2.982C6.52 3 7.08 3 8.2 3h9.2c1.236 0 1.6.437 1.6 1.6v11.8c0 .995-.282 1.425-1 1.555M9.5 10h5M12 7.5v5"/></svg>`;

const DASHBOARD_CHART_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-width="1.5"><rect width="18.5" height="18.5" x="2.75" y="2.75" rx="6"/><path stroke-linecap="round" stroke-linejoin="round" d="m7 15l2.45-3.26a1 1 0 0 1 1.33-.25L13.17 13a1 1 0 0 0 1.37-.29L17 9"/></g></svg>`;

const EXCHANGE_B_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M19.75 6.75h-12a4 4 0 0 0-4 4v2m16-1v2a4 4 0 0 1-4 4h-12"/><path d="m16.75 9.75l3-3l-3-3m-10 11l-3 3l3 3"/></g></svg>`;

const CALENDAR_2_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 4.625H7a4 4 0 0 0-4 4v8.75a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4v-8.75a4 4 0 0 0-4-4m-14 6h18m-4-8v4m-10-4v4m.375 7.515h1.028m7.194 0h1.028m-5.139 0h1.028m-5.139 3.084h1.028m7.194 0h1.028m-5.139 0h1.028"/></svg>`;

const LIST_ROUNDED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M8 9q-.425 0-.712-.288T7 8t.288-.712T8 7h12q.425 0 .713.288T21 8t-.288.713T20 9zm0 4q-.425 0-.712-.288T7 12t.288-.712T8 11h12q.425 0 .713.288T21 12t-.288.713T20 13zm0 4q-.425 0-.712-.288T7 16t.288-.712T8 15h12q.425 0 .713.288T21 16t-.288.713T20 17zM4 9q-.425 0-.712-.288T3 8t.288-.712T4 7t.713.288T5 8t-.288.713T4 9m0 4q-.425 0-.712-.288T3 12t.288-.712T4 11t.713.288T5 12t-.288.713T4 13m0 4q-.425 0-.712-.288T3 16t.288-.712T4 15t.713.288T5 16t-.288.713T4 17"/></svg>`;

const PERSON_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><path d="M0 0h56v56H0z" fill="none"/><path fill="currentColor" d="M28.012 27.367c5.039 0 9.375-4.5 9.375-10.36c0-5.788-4.36-10.077-9.375-10.077c-5.016 0-9.375 4.383-9.375 10.125c0 5.812 4.36 10.312 9.375 10.312M13.293 49.07h29.438c3.68 0 4.992-1.054 4.992-3.117c0-6.047-7.57-14.39-19.711-14.39c-12.164 0-19.735 8.343-19.735 14.39c0 2.063 1.313 3.117 5.016 3.117"/></svg>`;

const PERSON_FILL_ADD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M0 0h16v16H0z" fill="none"/><g fill="currentColor"><path d="M12.5 16a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7m.5-5v1h1a.5.5 0 0 1 0 1h-1v1a.5.5 0 0 1-1 0v-1h-1a.5.5 0 0 1 0-1h1v-1a.5.5 0 0 1 1 0m-2-6a3 3 0 1 1-6 0a3 3 0 0 1 6 0"/><path d="M2 13c0 1 1 1 1 1h5.256A4.5 4.5 0 0 1 8 12.5a4.5 4.5 0 0 1 1.544-3.393Q8.844 9.002 8 9c-5 0-6 3-6 4"/></g></svg>`;

const PERSON_2_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><path d="M0 0h56v56H0z" fill="none"/><path fill="currentColor" d="M38.723 28.549c4.417 0 8.217-3.944 8.217-9.08c0-5.074-3.82-8.833-8.217-8.833c-4.396 0-8.217 3.841-8.217 8.874c0 5.095 3.8 9.039 8.217 9.039m-23.645.473c3.821 0 7.15-3.452 7.15-7.91c0-4.416-3.35-7.683-7.15-7.683c-3.82 0-7.19 3.349-7.169 7.725c0 4.416 3.328 7.868 7.17 7.868M3.616 47.572h15.612c-2.136-3.102.473-9.347 4.89-12.757c-2.28-1.52-5.219-2.65-9.06-2.65C5.793 32.164 0 39.004 0 44.695c0 1.85 1.027 2.877 3.616 2.877m22.186 0h25.822c3.225 0 4.376-.925 4.376-2.733c0-5.3-6.636-12.613-17.297-12.613c-10.641 0-17.277 7.313-17.277 12.614c0 1.807 1.15 2.732 4.376 2.732"/></svg>`;

const MAP_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0-6 0"/><path d="M17.657 16.657L13.414 20.9a2 2 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0"/></g></svg>`;

const MAP_PIN_PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0-6 0"/><path d="M12.794 21.322a2 2 0 0 1-2.207-.422l-4.244-4.243a8 8 0 1 1 13.59-4.616M16 19h6m-3-3v6"/></g></svg>`;

const FOLDER_PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path stroke-miterlimit="10" d="M11.993 10.307v6.874m-3.43-3.437h6.874" /><path stroke-linejoin="round" d="M21.25 9.883v7.698a3.083 3.083 0 0 1-3.083 3.083H5.833a3.083 3.083 0 0 1-3.083-3.083V6.419a3.083 3.083 0 0 1 3.083-3.083h3.084a3.08 3.08 0 0 1 2.57 1.377l.873 1.326a1.75 1.75 0 0 0 1.449.77h4.358a3.084 3.084 0 0 1 3.083 3.074" /></g></svg>`;

const PLUS_SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.861V17.14M17.14 12H6.86" /><rect width="18.5" height="18.5" x="2.75" y="2.75" rx="6" /></g></svg>`;

const MINUS_SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.882 12H7.118" /><rect width="18.5" height="18.5" x="2.75" y="2.75" rx="6" /></g></svg>`;

const CHECK_SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m7.393 12.084l2.593 2.593a.983.983 0 0 0 1.395 0l5.227-5.226" /><rect width="18.5" height="18.5" x="2.75" y="2.75" rx="6" /></g></svg>`;

const TIMELINE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M19 9c-1.3 0-2.4.84-2.82 2H13V2h-2v3H7.82A2.99 2.99 0 0 0 5 3C3.35 3 2 4.35 2 6s1.35 3 3 3c1.3 0 2.4-.84 2.82-2H11v10H7.82A2.99 2.99 0 0 0 5 15c-1.65 0-3 1.35-3 3s1.35 3 3 3c1.3 0 2.4-.84 2.82-2H11v3h2v-9h3.18c.41 1.16 1.51 2 2.82 2c1.65 0 3-1.35 3-3s-1.35-3-3-3" /></svg>`;

// icon-park "twotone" style: a currentColor rect masked by inset line-art (notebook cover + rings + spine).
const NOTEBOOK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><mask id="sf-notebook-mask"><g fill="none" stroke="#fff" stroke-linejoin="round" stroke-width="4"><path fill="#555" d="M10 6a2 2 0 0 1 2-2h28a2 2 0 0 1 2 2v36a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2z" /><path stroke-linecap="round" d="M34 6v36M6 14h8M6 24h8M6 34h8M27 4h12M27 44h12" /></g></mask></defs><path fill="currentColor" d="M0 0h48v48H0z" mask="url(#sf-notebook-mask)" /></svg>`;

// "raphael--book" (open book, spine + page-curl details), Storytelling panel's tab icon.
const STORYTELLING_BOOK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="currentColor" d="M25.754 4.626a.88.88 0 0 0-.802-.097L12.16 9.41c-.557.212-1.253.315-1.968.315c-.997.002-2.03-.202-2.747-.48a3.4 3.4 0 0 1-.624-.302q.084-.037.194-.075L18.648 4.43l1.733.654V3.172a.87.87 0 0 0-.373-.714a.88.88 0 0 0-.802-.097L6.415 7.24c-.396.143-.733.313-1.02.565c-.284.244-.527.645-.523 1.09c0 .013.004.032.004.032v17.186l-.003.02c0 .007.003.01.003.017v.017h.002c.028.6.37.983.7 1.255c1.033.803 2.768 1.252 4.613 1.274c.875 0 1.762-.116 2.584-.427l12.796-4.882a.86.86 0 0 0 .558-.81V5.342a.87.87 0 0 0-.374-.714zm-20.082 7.11a.9.9 0 0 1 .07.273l.003.053c.016.264.13.406.363.61c.783.627 2.382 1.08 4.083 1.094a6.8 6.8 0 0 0 1.932-.264v1.79c-.647.144-1.3.207-1.942.207c-1.674-.026-3.266-.353-4.51-1.053zm4.51 12.852c-1.675-.028-3.267-.354-4.51-1.055V20.82a.8.8 0 0 1 .07.276l.003.053c.018.266.13.407.364.612c.782.625 2.38 1.08 4.082 1.09c.67 0 1.327-.08 1.932-.26v1.788a9 9 0 0 1-1.943.208z" /></svg>`;

const CYCLE_ALT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M405.333 128c22.493 0 40.921 13.685 42.55 36.505l.117 3.291v176.408c0 23.249-20.59 38.112-42.667 39.796h-97.792l27.544 32.815L304.915 448l-79.085-81.745l79.085-81.745l30.17 31.184l-27.544 25.639h97.792V170.667H320V128zM207.085 64l79.085 81.745l-79.085 81.745l-30.17-31.184l25.752-25.639h-96v170.666H192V384h-85.333c-22.493 0-40.921-13.685-42.55-36.505L64 344.204V167.796c0-23.249 9.923-38.112 32-39.796h106.667l-25.752-32.815z" /></svg>`;

const TEXT_STYLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>`;

const UI_FORMATTING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 12h4.5m4.5 0h4.5m4.5 0H21M3 6h4.5m4.5 0h4.5m4.5 0H21M3 18h4.5m4.5 0h4.5m4.5 0H21"/></svg>`;

const HIDE_UI_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 12h18M3 12a9 9 0 0 1 9-9m-9 9a9 9 0 0 0 9 9m-9-9a9 9 0 0 1 9-9m-9-9a9 9 0 0 0-9 9m9 9a9 9 0 0 1-9-9"/></svg>`;

const PROTECTIONS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 2l7 4v5c0 5.5-3.8 10-7 12-3.2-2-7-6.5-7-12V6l7-4z"/></svg>`;

/** IconPark two-tone Hammer And Anvil — fill tone via opacity, stroke via currentColor. */
const HAMMER_ANVIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><g fill="currentColor" fill-opacity="0.25" stroke="none"><path d="M6 14C6 4 14 4 14 4v20H6z"/><rect width="28" height="6" x="14" y="10"/><path d="M6 30h36s0 8-6 8h-7l2 6H13l2-6H6z"/></g><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="4" d="M6 14C6 4 14 4 14 4v20H6zm8-4h28v6H14zM6 30h36s0 8-6 8h-7l2 6H13l2-6H6z"/></svg>`;

/** Mage Icons — file with plus (add synopsis to chapter plot). */
const FILE_PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path stroke-linejoin="round" d="M14.186 2.753v3.596c0 .487.194.955.54 1.3a1.85 1.85 0 0 0 1.306.539h4.125"/><path stroke-linejoin="round" d="M20.25 8.568v8.568a4.25 4.25 0 0 1-1.362 2.97a4.28 4.28 0 0 1-3.072 1.14h-7.59a4.3 4.3 0 0 1-3.1-1.124a4.26 4.26 0 0 1-1.376-2.986V6.862a4.25 4.25 0 0 1 1.362-2.97a4.28 4.28 0 0 1 3.072-1.14h5.714a3.5 3.5 0 0 1 2.361.905l2.96 2.722a2.97 2.97 0 0 1 1.031 2.189"/><path stroke-miterlimit="10" d="M11.57 10.424v7.116m-3.55-3.55h7.117"/></g></svg>`;

/** Mono Icons — eye (open chapter in editor). */
const EYE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="currentColor"><path d="M15 12a3 3 0 1 1-6 0a3 3 0 0 1 6 0"/><path d="M21.894 11.553C19.736 7.236 15.904 5 12 5s-7.736 2.236-9.894 6.553a1 1 0 0 0 0 .894C4.264 16.764 8.096 19 12 19s7.736-2.236 9.894-6.553a1 1 0 0 0 0-.894M12 17c-2.969 0-6.002-1.62-7.87-5C5.998 8.62 9.03 7 12 7s6.002 1.62 7.87 5c-1.868 3.38-4.901 5-7.87 5"/></g></svg>`;

/** Mage Icons — multiply in rounded square (clear dossier entity). */
const MULTIPLY_SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m15.854 8.146l-7.708 7.708m7.708 0L8.146 8.146"/><rect width="18.5" height="18.5" x="2.75" y="2.75" rx="6"/></g></svg>`;

// --- Tag/type icon catalog additions (Phosphor number circles, Tabler, Mage Icons) ---

const NUMBER_CIRCLE_0_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M0 0h256v256H0z" fill="none" /><path fill="currentColor" d="M128 20a108 108 0 1 0 108 108A108.12 108.12 0 0 0 128 20m0 192a84 84 0 1 1 84-84a84.09 84.09 0 0 1-84 84m0-144c-28.26 0-48 24.67-48 60s19.74 60 48 60s48-24.67 48-60s-19.74-60-48-60m0 96c-23.33 0-24-32.32-24-36s.67-36 24-36s24 32.32 24 36s-.67 36-24 36" /></svg>`;

const NUMBER_CIRCLE_1_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M0 0h256v256H0z" fill="none" /><path fill="currentColor" d="M128 20a108 108 0 1 0 108 108A108.12 108.12 0 0 0 128 20m0 192a84 84 0 1 1 84-84a84.09 84.09 0 0 1-84 84m16-132v96a12 12 0 0 1-24 0v-73.58l-5.34 3.58a12 12 0 0 1-13.32-20l24-16A12 12 0 0 1 144 80" /></svg>`;

const NUMBER_CIRCLE_2_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M0 0h256v256H0z" fill="none" /><path fill="currentColor" d="M128 20a108 108 0 1 0 108 108A108.12 108.12 0 0 0 128 20m0 192a84 84 0 1 1 84-84a84.09 84.09 0 0 1-84 84m28.75-86.33L128 164h24a12 12 0 0 1 0 24h-48a12 12 0 0 1-9.6-19.2l43.17-57.56A12 12 0 1 0 116.68 100a12 12 0 0 1-22.63-8a36.3 36.3 0 0 1 5.2-9.67a36 36 0 0 1 57.5 43.34" /></svg>`;

const NUMBER_CIRCLE_3_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M0 0h256v256H0z" fill="none" /><path fill="currentColor" d="M128 20a108 108 0 1 0 108 108A108.12 108.12 0 0 0 128 20m0 192a84 84 0 1 1 84-84a84.09 84.09 0 0 1-84 84m36-60a40 40 0 0 1-68.57 28a12 12 0 1 1 17.14-16.79A16 16 0 1 0 124 136a12 12 0 0 1-9.83-18.88L129 96h-25a12 12 0 0 1 0-24h48a12 12 0 0 1 9.83 18.88l-18.34 26.2A40 40 0 0 1 164 152" /></svg>`;

const NUMBER_CIRCLE_4_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M0 0h256v256H0z" fill="none" /><path fill="currentColor" d="M128 20a108 108 0 1 0 108 108A108.12 108.12 0 0 0 128 20m0 192a84 84 0 1 1 84-84a84.09 84.09 0 0 1-84 84m32-72h-4V80a12 12 0 0 0-21.47-7.37l-56 72A12 12 0 0 0 88 164h44v12a12 12 0 0 0 24 0v-12h4a12 12 0 0 0 0-24m-28 0h-19.46L132 115Z" /></svg>`;

const NUMBER_CIRCLE_5_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M0 0h256v256H0z" fill="none" /><path fill="currentColor" d="M128 20a108 108 0 1 0 108 108A108.12 108.12 0 0 0 128 20m0 192a84 84 0 1 1 84-84a84.09 84.09 0 0 1-84 84m-5.83-120l-2.71 16.23A45 45 0 0 1 124 108a40 40 0 0 1 0 80a39.53 39.53 0 0 1-28.57-11.6a12 12 0 1 1 17.14-16.8A15.54 15.54 0 0 0 124 164a16 16 0 0 0 0-32a15.54 15.54 0 0 0-11.43 4.4A12 12 0 0 1 92.16 126l8-48A12 12 0 0 1 112 68h40a12 12 0 0 1 0 24Z" /></svg>`;

const NUMBER_CIRCLE_6_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M0 0h256v256H0z" fill="none" /><path fill="currentColor" d="M128 20a108 108 0 1 0 108 108A108.12 108.12 0 0 0 128 20m0 192a84 84 0 1 1 84-84a84.09 84.09 0 0 1-84 84m5.06-103.67l13.24-22.18a12 12 0 1 0-20.6-12.3l-32.24 54a40 40 0 1 0 39.6-19.53ZM128 164a16 16 0 1 1 16-16a16 16 0 0 1-16 16" /></svg>`;

const NUMBER_CIRCLE_7_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M0 0h256v256H0z" fill="none" /><path fill="currentColor" d="M128 20a108 108 0 1 0 108 108A108.12 108.12 0 0 0 128 20m0 192a84 84 0 1 1 84-84a84.09 84.09 0 0 1-84 84m33.83-130.88a12 12 0 0 1 1.45 11l-32 88a12 12 0 0 1-22.56-8.2L134.87 100H104a12 12 0 0 1 0-24h48a12 12 0 0 1 9.83 5.12" /></svg>`;

const NUMBER_CIRCLE_8_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M0 0h256v256H0z" fill="none" /><path fill="currentColor" d="M128 20a108 108 0 1 0 108 108A108.12 108.12 0 0 0 128 20m0 192a84 84 0 1 1 84-84a84.09 84.09 0 0 1-84 84m27.6-88.91a36 36 0 1 0-55.2 0a40 40 0 1 0 55.2 0M116 100a12 12 0 1 1 12 12a12 12 0 0 1-12-12m12 68a16 16 0 1 1 16-16a16 16 0 0 1-16 16" /></svg>`;

const NUMBER_CIRCLE_9_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M0 0h256v256H0z" fill="none" /><path fill="currentColor" d="M128 20a108 108 0 1 0 108 108A108.12 108.12 0 0 0 128 20m0 192a84 84 0 1 1 84-84a84.09 84.09 0 0 1-84 84m20-138.64a40 40 0 1 0-25.06 74.32l-13.24 22.17a12 12 0 1 0 20.6 12.3L162.64 128A40 40 0 0 0 148 73.36M141.86 116A16 16 0 1 1 136 94.14a16 16 0 0 1 5.84 21.86Z" /></svg>`;

/** Tabler Icons — eye (outline, distinct from ICON_EYE's filled Mono Icons glyph). */
const EYE_OUTLINE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0-4 0" /><path d="M21 12q-3.6 6-9 6t-9-6q3.6-6 9-6t9 6" /></g></svg>`;

/** Mage Icons — exclamation in rounded square (outline). */
const EXCLAMATION_SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.958 7.563v6.166" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 17.139h-.009" /><rect width="18.5" height="18.5" x="2.75" y="2.75" stroke-width="1.5" rx="6" /></g></svg>`;

/** Mage Icons — exclamation in rounded square (filled). */
const EXCLAMATION_SQUARE_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M15.25 2h-6.5A6.76 6.76 0 0 0 2 8.75v6.5A6.76 6.76 0 0 0 8.75 22h6.5A6.76 6.76 0 0 0 22 15.25v-6.5A6.76 6.76 0 0 0 15.25 2m-4.29 5.56a1 1 0 0 1 2 0v6.17a1 1 0 1 1-2 0zm1 10.58a1 1 0 1 1 .03 0z" /></svg>`;

/** Mage Icons — stars (filled, two-tone via a duplicate glyph). */
const STARS_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M21.97 14.607a1.07 1.07 0 0 1-.73 1l-1.88.62a3.9 3.9 0 0 0-1.56 1a4.06 4.06 0 0 0-1 1.57l-.65 1.87a1.14 1.14 0 0 1-.38.52a1.1 1.1 0 0 1-.63.2a1 1 0 0 1-.62-.2a1.07 1.07 0 0 1-.39-.53l-.63-1.88a4 4 0 0 0-2.53-2.54l-1.88-.62a1.13 1.13 0 0 1-.53-.39a1.06 1.06 0 0 1 .54-1.64l1.87-.62a4 4 0 0 0 2.56-2.55l.62-1.86a1 1 0 0 1 .36-.52a1 1 0 0 1 .61-.23a1 1 0 0 1 .64.18a1 1 0 0 1 .41.52l.63 1.9a4 4 0 0 0 2.55 2.56l1.87.65a1 1 0 0 1 .52.38a1.1 1.1 0 0 1 .23.61M12.1 7.656a1 1 0 0 1-.67.93l-1.34.44a2.6 2.6 0 0 0-1 .64a2.7 2.7 0 0 0-.64 1l-.47 1.34a1 1 0 0 1-.34.47a1.05 1.05 0 0 1-.58.19a1 1 0 0 1-.93-.68l-.44-1.34a2.6 2.6 0 0 0-.64-1a2.7 2.7 0 0 0-1-.64l-1.35-.45a.92.92 0 0 1-.48-.36a.93.93 0 0 1-.19-.57a1 1 0 0 1 .19-.58a1 1 0 0 1 .49-.34l1.34-.45a2.7 2.7 0 0 0 1-.64c.29-.277.509-.62.64-1l.45-1.32a1 1 0 0 1 .33-.48a.93.93 0 0 1 .56-.2a.87.87 0 0 1 .58.16a1 1 0 0 1 .38.47l.45 1.37c.135.378.354.72.64 1a2.7 2.7 0 0 0 1 .64l1.35.47a1 1 0 0 1 .65.92z" /></svg>`;

/** Mage Icons — shop/storefront. */
const SHOP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M21.25 9.944a3.08 3.08 0 0 1-2.056 2.899a2.9 2.9 0 0 1-1.027.185a3.08 3.08 0 0 1-2.899-2.056a2.9 2.9 0 0 1-.185-1.028c.003.351-.06.7-.185 1.028A3.08 3.08 0 0 1 12 13.028a3.08 3.08 0 0 1-2.898-2.056a2.9 2.9 0 0 1-.185-1.028c.002.351-.06.7-.185 1.028a3.08 3.08 0 0 1-2.899 2.056c-.35.002-.7-.06-1.027-.185A3.08 3.08 0 0 1 2.75 9.944l.462-1.623l1.11-3.166a2.06 2.06 0 0 1 1.943-1.377h11.47a2.06 2.06 0 0 1 1.942 1.377l1.11 3.166z" /><path d="M19.194 12.843v5.324a2.056 2.056 0 0 1-2.055 2.055H6.86a2.055 2.055 0 0 1-2.056-2.055v-5.324m4.113 4.296h6.166" /></g></svg>`;

/** Mage Icons — settings (cog wheel; distinct from ICON_FILTER's funnel-lines "settings" glyph). */
const SETTINGS_GEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M12.132 15.404a3.364 3.364 0 1 0 0-6.728a3.364 3.364 0 0 0 0 6.728" /><path d="M20.983 15.094a9.4 9.4 0 0 1-1.802 3.1l-2.124-.482a7.25 7.25 0 0 1-2.801 1.56l-.574 2.079a9.5 9.5 0 0 1-1.63.149a9 9 0 0 1-2.032-.23l-.609-2.146a7.5 7.5 0 0 1-2.457-1.493l-2.1.54a9.4 9.4 0 0 1-1.837-3.33l1.55-1.722a7.2 7.2 0 0 1 .069-2.652L3.107 8.872a9.4 9.4 0 0 1 2.067-3.353l2.17.54A7.7 7.7 0 0 1 9.319 4.91l.574-2.124a9 9 0 0 1 2.17-.287c.585 0 1.17.054 1.745.16l.551 2.113c.83.269 1.608.68 2.296 1.217l2.182-.563a9.4 9.4 0 0 1 2.043 3.1l-1.48 1.607a7.4 7.4 0 0 1 .068 3.364z" /></g></svg>`;

/** Mage Icons — fire/flame. */
const FIRE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M4.21 14.434c0 6.328 5.843 6.816 7.79 6.816s7.79-.488 7.79-6.816c0-2.869-2.819-3.772-3.895-7.79c-6.816 7.79-5.842-3.894-5.842-3.894S4.21 8.592 4.21 14.434" /><path d="M8.02 13.694c-.422 2.17 1.345 3.862 3.024 4.189" /></g></svg>`;

/** Mage Icons — crown. */
const CROWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m19.349 5.255l-3.238 3.11l-3.196-4.354a1.027 1.027 0 0 0-1.83 0L7.89 8.366L4.65 5.255a1.028 1.028 0 0 0-1.901.503l1.593 11.203a4.11 4.11 0 0 0 4.111 3.587h7.195a4.11 4.11 0 0 0 4.11-3.587L21.25 5.758a1.028 1.028 0 0 0-1.901-.503M8 16.447h8" /></svg>`;

/** Mage Icons — calendar (plain, no day markers; distinct from ICON_CALENDAR's dotted variant). */
const CALENDAR_PLAIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 4.625H7a4 4 0 0 0-4 4v8.75a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4v-8.75a4 4 0 0 0-4-4m-14 6h18m-4-8v4m-10-4v4" /></svg>`;

/** Mage Icons — building, variant A (single door). */
const BUILDING_A_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M8.531 3.212h6.938a2.775 2.775 0 0 1 2.775 2.775v14.8H5.756v-14.8a2.775 2.775 0 0 1 2.775-2.775M2.75 20.788h18.5" /><path d="M11.075 14.313h1.85a1.387 1.387 0 0 1 1.387 1.387v5.088H9.689V15.7a1.387 1.387 0 0 1 1.387-1.387m-1.851-7.4h5.55m-5.55 3.7h5.55" /></g></svg>`;

/** Mage Icons — building, variant B (taller, offset door). */
const BUILDING_B_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M5.978 3.212h6.938a2.775 2.775 0 0 1 2.775 2.775v14.8H3.203v-14.8a2.775 2.775 0 0 1 2.775-2.775M2.75 20.788h18.5" /><path d="M8.531 14.313h1.85A1.39 1.39 0 0 1 11.77 15.7v5.088H7.144V15.7a1.387 1.387 0 0 1 1.387-1.387m-1.859-7.4h5.55m-5.55 3.7h5.55m3.468-1.388h1.85A2.775 2.775 0 0 1 20.317 12v8.788" /></g></svg>`;

/** Mage Icons — bookmark (outline). */
const BOOKMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m10.94 18.339l-3.43 2.548a1.71 1.71 0 0 1-2.76-1.23V6.35a3.735 3.735 0 0 1 3.87-3.597h6.76a3.74 3.74 0 0 1 3.87 3.597v13.309a1.708 1.708 0 0 1-2.76 1.229l-3.43-2.548a1.8 1.8 0 0 0-2.12 0" /></svg>`;

/** Mage Icons — bookmark (filled). */
const BOOKMARK_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M19.97 6.321v13.33a2.47 2.47 0 0 1-1.45 2.13a2.53 2.53 0 0 1-1.3.2a2.46 2.46 0 0 1-1.22-.51l-3.41-2.53a1.07 1.07 0 0 0-1.23 0l-3.43 2.56a2.47 2.47 0 0 1-1.2.5h-.3a2.4 2.4 0 0 1-1-.22a2.5 2.5 0 0 1-1-.83a2.53 2.53 0 0 1-.43-1.25V6.342a4.49 4.49 0 0 1 4.65-4.34h6.73A4.49 4.49 0 0 1 20 6.321z" /></svg>`;

/** Mage Icons — check in circle (replaces the stock "check-circle" Lucide icon formerly in the tag catalog). */
const CHECK_CIRCLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="m6.9 12.087l2.664 2.663a1.01 1.01 0 0 0 1.433 0l5.367-5.368" /><path d="M12 21.5a9.5 9.5 0 1 0 0-19a9.5 9.5 0 0 0 0 19" /></g></svg>`;

/** Mage Icons — flag (outline; replaces the stock "flag" Lucide icon formerly in the tag catalog). */
const FLAG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.382 14.72s1.089-1.088 4.353-1.088c3.265 0 3.265 2.177 6.53 2.177a11.3 11.3 0 0 0 4.353-1.088V3.838a11.3 11.3 0 0 1-4.353 1.088C12 4.926 12 2.75 8.735 2.75c-3.264 0-4.353 1.088-4.353 1.088m0 17.412V3.838" /></svg>`;

/** Mage Icons — flag (filled). */
const FLAG_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M20.372 3.86v10.88a.75.75 0 0 1-.43.68a11.85 11.85 0 0 1-4.64 1.16a5.9 5.9 0 0 1-3.71-1.21a4.45 4.45 0 0 0-2.85-1a7.16 7.16 0 0 0-3.61.73v6.13a.75.75 0 1 1-1.5 0V3.86a1 1 0 0 1 0-.15a.76.76 0 0 1 .31-.47c.38-.32 1.73-1.22 4.78-1.22a5.87 5.87 0 0 1 3.68 1.22a4.46 4.46 0 0 0 2.85 1a10.3 10.3 0 0 0 4-1a.74.74 0 0 1 .72.05a.73.73 0 0 1 .4.57" /></svg>`;

/** Solar Icons — star (linear/outline; replaces the stock "star" Lucide icon formerly in the tag catalog). */
const STAR_OUTLINE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-width="1.5" d="M9.153 5.408C10.42 3.136 11.053 2 12 2s1.58 1.136 2.847 3.408l.328.588c.36.646.54.969.82 1.182s.63.292 1.33.45l.636.144c2.46.557 3.689.835 3.982 1.776c.292.94-.546 1.921-2.223 3.882l-.434.507c-.476.557-.715.836-.822 1.18c-.107.345-.071.717.001 1.46l.066.677c.253 2.617.38 3.925-.386 4.506s-1.918.051-4.22-1.009l-.597-.274c-.654-.302-.981-.452-1.328-.452s-.674.15-1.328.452l-.596.274c-2.303 1.06-3.455 1.59-4.22 1.01c-.767-.582-.64-1.89-.387-4.507l.066-.676c.072-.744.108-1.116 0-1.46c-.106-.345-.345-.624-.821-1.18l-.434-.508c-1.677-1.96-2.515-2.941-2.223-3.882S3.58 8.328 6.04 7.772l.636-.144c.699-.158 1.048-.237 1.329-.45s.46-.536.82-1.182z" /></svg>`;

/** Solar Icons — star (bold/filled). */
const STAR_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M9.153 5.408C10.42 3.136 11.053 2 12 2s1.58 1.136 2.847 3.408l.328.588c.36.646.54.969.82 1.182s.63.292 1.33.45l.636.144c2.46.557 3.689.835 3.982 1.776c.292.94-.546 1.921-2.223 3.882l-.434.507c-.476.557-.715.836-.822 1.18c-.107.345-.071.717.001 1.46l.066.677c.253 2.617.38 3.925-.386 4.506s-1.918.051-4.22-1.009l-.597-.274c-.654-.302-.981-.452-1.328-.452s-.674.15-1.328.452l-.596.274c-2.303 1.06-3.455 1.59-4.22 1.01c-.767-.582-.64-1.89-.387-4.507l.066-.676c.072-.744.108-1.116 0-1.46c-.106-.345-.345-.624-.821-1.18l-.434-.508c-1.677-1.96-2.515-2.941-2.223-3.882S3.58 8.328 6.04 7.772l.636-.144c.699-.158 1.048-.237 1.329-.45s.46-.536.82-1.182z" /></svg>`;

/** Solar Icons — star (bold duotone). */
const STAR_DUOTONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M18.483 16.767A8.5 8.5 0 0 1 8.118 7.081a1 1 0 0 1-.113.097c-.28.213-.63.292-1.33.45l-.635.144c-2.46.557-3.69.835-3.983 1.776c-.292.94.546 1.921 2.223 3.882l.434.507c.476.557.715.836.822 1.18c.107.345.071.717-.001 1.46l-.066.677c-.253 2.617-.38 3.925.386 4.506s1.918.052 4.22-1.009l.597-.274c.654-.302.981-.452 1.328-.452s.674.15 1.329.452l.595.274c2.303 1.06 3.455 1.59 4.22 1.01c.767-.582.64-1.89.387-4.507z" /><path fill="currentColor" d="m9.153 5.408l-.328.588c-.36.646-.54.969-.82 1.182q.06-.045.113-.097a8.5 8.5 0 0 0 10.366 9.686l-.02-.19c-.071-.743-.107-1.115 0-1.46c.107-.344.345-.623.822-1.18l.434-.507c1.677-1.96 2.515-2.941 2.222-3.882c-.292-.941-1.522-1.22-3.982-1.776l-.636-.144c-.699-.158-1.049-.237-1.33-.45c-.28-.213-.46-.536-.82-1.182l-.327-.588C13.58 3.136 12.947 2 12 2s-1.58 1.136-2.847 3.408" opacity=".5" /></svg>`;

/** Simple Line Icons — lock (replaces the stock "lock" Lucide icon formerly in the tag catalog). */
const LOCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path d="M0 0h1024v1024H0z" fill="none" /><path fill="currentColor" d="M800 384h-32V261.872C768 115.024 661.744 0 510.816 0C359.28 0 256 117.472 256 261.872V384h-32c-70.592 0-128 57.408-128 128v384c0 70.592 57.408 128 128 128h576c70.592 0 128-57.408 128-128V512c0-70.592-57.408-128-128-128M320 261.872C320 152.784 394.56 64 510.816 64C625.872 64 704 150.912 704 261.872V384H320zM864.001 896c0 35.28-28.72 64-64 64h-576c-35.28 0-64-28.72-64-64V512c0-35.28 28.72-64 64-64h576c35.28 0 64 28.72 64 64zm-352-320c-35.344 0-64 28.656-64 64c0 23.632 12.96 44.032 32 55.12V800c0 17.664 14.336 32 32 32s32-14.336 32-32V695.12c19.04-11.088 32-31.504 32-55.12c0-35.344-28.656-64-64-64" /></svg>`;

/** Ionicons — heart in circle (filled). */
const HEART_CIRCLE_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z" fill="none" /><path fill="currentColor" d="M256 48C141.31 48 48 141.31 48 256s93.31 208 208 208s208-93.31 208-208S370.69 48 256 48m74.69 252.82c-9.38 11.44-26.4 29.73-65.7 56.41a15.93 15.93 0 0 1-18 0c-39.3-26.68-56.32-45-65.7-56.41c-20-24.37-29.58-49.4-29.3-76.5c.31-31.06 25.22-56.33 55.53-56.33c20.4 0 35 10.63 44.1 20.41a6 6 0 0 0 8.72 0c9.11-9.78 23.7-20.41 44.1-20.41c30.31 0 55.22 25.27 55.53 56.33c.3 27.1-9.29 52.13-29.28 76.5" /></svg>`;

/** Ionicons — heart in circle (outline). */
const HEART_CIRCLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192s192-86 192-192Z" /><path fill="currentColor" d="M256 360a16 16 0 0 1-9-2.78c-39.3-26.68-56.32-45-65.7-56.41c-20-24.37-29.58-49.4-29.3-76.5c.31-31.06 25.22-56.33 55.53-56.33c20.4 0 35 10.63 44.1 20.41a6 6 0 0 0 8.72 0c9.11-9.78 23.7-20.41 44.1-20.41c30.31 0 55.22 25.27 55.53 56.33c.28 27.1-9.31 52.13-29.3 76.5c-9.38 11.44-26.4 29.73-65.7 56.41A16 16 0 0 1 256 360" /></svg>`;

/** Ionicons — heart (outline, no circle). */
const HEART_OUTLINE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M352.92 80C288 80 256 144 256 144s-32-64-96.92-64c-52.76 0-94.54 44.14-95.08 96.81c-1.1 109.33 86.73 187.08 183 252.42a16 16 0 0 0 18 0c96.26-65.34 184.09-143.09 183-252.42c-.54-52.67-42.32-96.81-95.08-96.81" /></svg>`;

/** Ionicons — heart (filled, no circle). */
const HEART_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z" fill="none" /><path fill="currentColor" d="M256 448a32 32 0 0 1-18-5.57c-78.59-53.35-112.62-89.93-131.39-112.8c-40-48.75-59.15-98.8-58.61-153C48.63 114.52 98.46 64 159.08 64c44.08 0 74.61 24.83 92.39 45.51a6 6 0 0 0 9.06 0C278.31 88.81 308.84 64 352.92 64c60.62 0 110.45 50.52 111.08 112.64c.54 54.21-18.63 104.26-58.61 153c-18.77 22.87-52.8 59.45-131.39 112.8a32 32 0 0 1-18 5.56" /></svg>`;

/** Mage Icons — check in circle (filled). */
const CHECK_CIRCLE_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M12 1.75A10.25 10.25 0 1 0 22.25 12A10.26 10.26 0 0 0 12 1.75m5.07 8.34l-5.37 5.37a1.8 1.8 0 0 1-.65.44c-.497.2-1.053.2-1.55 0a2 2 0 0 1-.65-.44L6.19 12.8a1.001 1.001 0 1 1 1.41-1.42l2.67 2.67l5.38-5.37a1 1 0 0 1 1.42 0a1 1 0 0 1 0 1.38z" /></svg>`;

/** Mynaui Icons — message bubble (solid). */
const MESSAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M11.953 2.25c-2.317 0-4.118 0-5.52.15c-1.418.153-2.541.47-3.437 1.186c-.92.736-1.35 1.693-1.553 2.9c-.193 1.152-.193 2.618-.193 4.446v.183c0 1.782 0 3.015.2 3.934c.108.495.278.925.545 1.323c.264.392.6.722 1.001 1.042c.631.505 1.375.81 2.254 1V21a.75.75 0 0 0 1.123.65c.586-.335 1.105-.7 1.58-1.044l.304-.221a22 22 0 0 1 1.036-.73c.844-.548 1.65-.905 2.707-.905h.047c2.317 0 4.118 0 5.52-.15c1.418-.153 2.541-.47 3.437-1.186c.4-.32.737-.65 1-1.042c.268-.398.438-.828.546-1.323c.2-.919.2-2.152.2-3.934v-.183c0-1.828 0-3.294-.193-4.445c-.203-1.208-.633-2.165-1.553-2.901c-.896-.717-2.019-1.033-3.437-1.185c-1.402-.151-3.203-.151-5.52-.151z" /></svg>`;

/** Mingcute Icons — tag (line). Replaces the stock Lucide "tag" id used as the generic placeholder
 * glyph for an unpicked icon (TagRegistryModal/TagPickerModal's "+ New tag" row) and as
 * resolveIconAlias's fallback for a stale/unknown alias. */
const TAG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-width="2" d="M3.738 12.223a2 2 0 0 1-.578-1.595l.472-5.186a2 2 0 0 1 1.81-1.81l5.186-.472a2 2 0 0 1 1.595.578l7.823 7.823a2 2 0 0 1 0 2.828l-5.657 5.657a2 2 0 0 1-2.828 0z" /><path fill="none" stroke="currentColor" stroke-width="2" d="M10.853 8.025a2 2 0 1 1-2.829 2.829a2 2 0 0 1 2.829-2.829Z" /></svg>`;

/** Akar Icons — info (circle outline). */
const INFO_CIRCLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><path stroke-linecap="round" d="M12 7h.01" /><path stroke-linecap="round" stroke-linejoin="round" d="M10 11h2v5m-2 0h4" /></g></svg>`;

/** Mage Icons — edit pen (distinct from the "pencil" stock Lucide icon already in the catalog). */
const EDIT_PEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m4.144 16.735l.493-3.425a.97.97 0 0 1 .293-.587l9.665-9.664a1.03 1.03 0 0 1 .973-.281a5.1 5.1 0 0 1 2.346 1.372a5.1 5.1 0 0 1 1.384 2.346a1.07 1.07 0 0 1-.282.973l-9.664 9.664a1.17 1.17 0 0 1-.598.294l-3.437.492a1.044 1.044 0 0 1-1.173-1.184m8.633-11.846l4.41 4.398M3.79 21.25h16.42" /></svg>`;

/** Mage Icons — verified check (outline). */
const VERIFIED_CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="m12.717 3.656l1.137-.904a1.134 1.134 0 0 1 1.808.584l.432 1.51a1.14 1.14 0 0 0 1.137.836h1.467a1.13 1.13 0 0 1 .96.449a1.15 1.15 0 0 1 .178 1.05l-.546 1.626a1.15 1.15 0 0 0 .41 1.293l1.33.973a1.14 1.14 0 0 1 .47.927a1.15 1.15 0 0 1-.47.927l-1.33.973a1.145 1.145 0 0 0-.41 1.293l.546 1.626a1.15 1.15 0 0 1-.602 1.394a1.1 1.1 0 0 1-.536.105h-1.467a1.13 1.13 0 0 0-.712.22a1.14 1.14 0 0 0-.425.616l-.432 1.51a1.15 1.15 0 0 1-.748.782a1.13 1.13 0 0 1-1.06-.198l-1.137-.904a1.13 1.13 0 0 0-1.434 0l-1.137.904a1.135 1.135 0 0 1-1.808-.584l-.432-1.51a1.15 1.15 0 0 0-.425-.617a1.13 1.13 0 0 0-.712-.219H5.302a1.13 1.13 0 0 1-.96-.449a1.15 1.15 0 0 1-.178-1.05l.546-1.626A1.15 1.15 0 0 0 4.3 13.9l-1.33-.973A1.14 1.14 0 0 1 2.5 12a1.15 1.15 0 0 1 .47-.927L4.3 10.1a1.14 1.14 0 0 0 .41-1.293l-.477-1.66a1.15 1.15 0 0 1 .602-1.394a1.1 1.1 0 0 1 .535-.105h1.467a1.145 1.145 0 0 0 1.137-.836l.432-1.51A1.15 1.15 0 0 1 9.17 2.6a1.13 1.13 0 0 1 1.011.209l1.138.904a1.13 1.13 0 0 0 1.399-.057" /><path d="m8.106 11.894l2.192 2.192a.83.83 0 0 0 1.18 0l4.417-4.418" /></g></svg>`;

/** Mage Icons — verified check (filled). */
const VERIFIED_CHECK_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M22.02 11.164a1.84 1.84 0 0 0-.57-.67l-1.33-1a.35.35 0 0 1-.14-.2a.36.36 0 0 1 0-.25l.55-1.63a2 2 0 0 0 .06-.9a1.8 1.8 0 0 0-.36-.84a1.86 1.86 0 0 0-.7-.57a1.75 1.75 0 0 0-.85-.17h-1.5a.41.41 0 0 1-.39-.3l-.43-1.5a1.9 1.9 0 0 0-.46-.81a2 2 0 0 0-.78-.49a2 2 0 0 0-.92-.06a1.9 1.9 0 0 0-.83.39l-1.14.9a.35.35 0 0 1-.23.09a.36.36 0 0 1-.22-.05l-1.13-.9a1.85 1.85 0 0 0-.8-.38a1.9 1.9 0 0 0-.88 0a1.9 1.9 0 0 0-.78.43a2.1 2.1 0 0 0-.51.79l-.43 1.51a.38.38 0 0 1-.15.22a.4.4 0 0 1-.27.07H5.41a1.9 1.9 0 0 0-.89.18a1.8 1.8 0 0 0-.71.57a1.9 1.9 0 0 0-.36.83c-.05.293-.03.595.06.88L4 8.993a.41.41 0 0 1-.14.45l-1.33 1c-.242.18-.44.412-.58.68a1.93 1.93 0 0 0 0 1.71a2 2 0 0 0 .58.68l1.33 1a.41.41 0 0 1 .14.45l-.55 1.63a2 2 0 0 0-.07.91c.05.298.174.58.36.82c.183.25.428.45.71.58c.265.126.557.184.85.17h1.49a.38.38 0 0 1 .25.08a.34.34 0 0 1 .14.21l.43 1.51a2 2 0 0 0 .46.8a1.89 1.89 0 0 0 2.54.17l1.15-.91a.39.39 0 0 1 .49 0l1.13.9c.24.202.53.337.84.39q.17.015.34 0a1.9 1.9 0 0 0 .58-.09a1.87 1.87 0 0 0 1.24-1.28l.44-1.52a.34.34 0 0 1 .14-.21a.4.4 0 0 1 .27-.08h1.43a2 2 0 0 0 .89-.17a1.91 1.91 0 0 0 1.06-1.4a1.9 1.9 0 0 0-.07-.92l-.54-1.62a.36.36 0 0 1 0-.25a.35.35 0 0 1 .14-.2l1.33-1a1.9 1.9 0 0 0 .57-.68a1.8 1.8 0 0 0 .21-.86a1.9 1.9 0 0 0-.23-.78m-5.44-.76l-4.42 4.42a2 2 0 0 1-.59.4c-.222.09-.46.138-.7.14a1.7 1.7 0 0 1-.71-.15a1.9 1.9 0 0 1-.6-.4l-2.18-2.19a1 1 0 0 1 1.41-1.41l2.08 2.08l4.3-4.31a1 1 0 0 1 1.41 0a1 1 0 0 1 0 1.46z" /></svg>`;

/** Registers storyForge's custom Lucide-style icons so `setIcon` can address them by id. */
export function registerCustomIcons(): void {
	addIcon(ICON_UNPLACED, INBOX_SVG);
	addIcon(ICON_ARCHIVE, BOX_SVG);
	addIcon(ICON_UNARCHIVE, ARROW_OUT_UP_SQUARE_SVG);
	addIcon(ICON_CODEX, EARTH_FILL_SVG);
	addIcon(ICON_SERIES, LIBRARY_SVG);
	addIcon(ICON_FILTER, FILTER_SVG);
	addIcon(ICON_BOOK_PLUS, BOOK_PLUS_SVG);
	addIcon(ICON_DASHBOARD_CHART, DASHBOARD_CHART_SVG);
	addIcon(ICON_EXCHANGE, EXCHANGE_B_SVG);
	addIcon(ICON_CALENDAR, CALENDAR_2_SVG);
	addIcon(ICON_TOOLS, LIST_ROUNDED_SVG);
	addIcon(ICON_FOLDER_PLUS, FOLDER_PLUS_SVG);
	addIcon(ICON_PLUS_SQUARE, PLUS_SQUARE_SVG);
	addIcon(ICON_MINUS_SQUARE, MINUS_SQUARE_SVG);
	addIcon(ICON_CHECK_SQUARE, CHECK_SQUARE_SVG);
	addIcon(ICON_TIMELINE, TIMELINE_SVG);
	addIcon(ICON_NOTEBOOK, NOTEBOOK_SVG);
	addIcon(ICON_STORYTELLING, STORYTELLING_BOOK_SVG);
	addIcon(ICON_CYCLE_ALT, CYCLE_ALT_SVG);
	addIcon(ICON_TEXT_STYLE, TEXT_STYLE_SVG);
	addIcon(ICON_UI_FORMATTING, UI_FORMATTING_SVG);
	addIcon(ICON_HIDE_UI, HIDE_UI_SVG);
	addIcon(ICON_PROTECTIONS, PROTECTIONS_SVG);
	addIcon(ICON_PERSON_FILL, PERSON_FILL_SVG);
	addIcon(ICON_PERSON_FILL_ADD, PERSON_FILL_ADD_SVG);
	addIcon(ICON_PERSON_2_FILL, PERSON_2_FILL_SVG);
	addIcon(ICON_MAP_PIN, MAP_PIN_SVG);
	addIcon(ICON_MAP_PIN_PLUS, MAP_PIN_PLUS_SVG);
	addIcon(ICON_FORGE, HAMMER_ANVIL_SVG);
	addIcon(ICON_FILE_PLUS, FILE_PLUS_SVG);
	addIcon(ICON_EYE, EYE_SVG);
	addIcon(ICON_MULTIPLY_SQUARE, MULTIPLY_SQUARE_SVG);
	addIcon(ICON_NUMBER_CIRCLE_0, NUMBER_CIRCLE_0_SVG);
	addIcon(ICON_NUMBER_CIRCLE_1, NUMBER_CIRCLE_1_SVG);
	addIcon(ICON_NUMBER_CIRCLE_2, NUMBER_CIRCLE_2_SVG);
	addIcon(ICON_NUMBER_CIRCLE_3, NUMBER_CIRCLE_3_SVG);
	addIcon(ICON_NUMBER_CIRCLE_4, NUMBER_CIRCLE_4_SVG);
	addIcon(ICON_NUMBER_CIRCLE_5, NUMBER_CIRCLE_5_SVG);
	addIcon(ICON_NUMBER_CIRCLE_6, NUMBER_CIRCLE_6_SVG);
	addIcon(ICON_NUMBER_CIRCLE_7, NUMBER_CIRCLE_7_SVG);
	addIcon(ICON_NUMBER_CIRCLE_8, NUMBER_CIRCLE_8_SVG);
	addIcon(ICON_NUMBER_CIRCLE_9, NUMBER_CIRCLE_9_SVG);
	addIcon(ICON_EYE_OUTLINE, EYE_OUTLINE_SVG);
	addIcon(ICON_EXCLAMATION_SQUARE, EXCLAMATION_SQUARE_SVG);
	addIcon(ICON_EXCLAMATION_SQUARE_FILL, EXCLAMATION_SQUARE_FILL_SVG);
	addIcon(ICON_INFO_CIRCLE, INFO_CIRCLE_SVG);
	addIcon(ICON_EDIT_PEN, EDIT_PEN_SVG);
	addIcon(ICON_VERIFIED_CHECK, VERIFIED_CHECK_SVG);
	addIcon(ICON_VERIFIED_CHECK_FILL, VERIFIED_CHECK_FILL_SVG);
	addIcon(ICON_STARS_FILL, STARS_FILL_SVG);
	addIcon(ICON_SHOP, SHOP_SVG);
	addIcon(ICON_SETTINGS_GEAR, SETTINGS_GEAR_SVG);
	addIcon(ICON_FIRE, FIRE_SVG);
	addIcon(ICON_CROWN, CROWN_SVG);
	addIcon(ICON_CALENDAR_PLAIN, CALENDAR_PLAIN_SVG);
	addIcon(ICON_BUILDING_A, BUILDING_A_SVG);
	addIcon(ICON_BUILDING_B, BUILDING_B_SVG);
	addIcon(ICON_BOOKMARK, BOOKMARK_SVG);
	addIcon(ICON_BOOKMARK_FILL, BOOKMARK_FILL_SVG);
	addIcon(ICON_CHECK_CIRCLE, CHECK_CIRCLE_SVG);
	addIcon(ICON_FLAG, FLAG_SVG);
	addIcon(ICON_FLAG_FILL, FLAG_FILL_SVG);
	addIcon(ICON_STAR_OUTLINE, STAR_OUTLINE_SVG);
	addIcon(ICON_STAR_FILL, STAR_FILL_SVG);
	addIcon(ICON_STAR_DUOTONE, STAR_DUOTONE_SVG);
	addIcon(ICON_LOCK, LOCK_SVG);
	addIcon(ICON_HEART_CIRCLE, HEART_CIRCLE_SVG);
	addIcon(ICON_HEART_CIRCLE_FILL, HEART_CIRCLE_FILL_SVG);
	addIcon(ICON_HEART_OUTLINE, HEART_OUTLINE_SVG);
	addIcon(ICON_HEART_FILL, HEART_FILL_SVG);
	addIcon(ICON_CHECK_CIRCLE_FILL, CHECK_CIRCLE_FILL_SVG);
	addIcon(ICON_MESSAGE, MESSAGE_SVG);
	addIcon(ICON_TAG, TAG_SVG);
	addIcon(ICON_TRANSPORT_TO_START, TRANSPORT_TO_START_SVG);
	addIcon(ICON_TRANSPORT_PREVIOUS, TRANSPORT_PREVIOUS_SVG);
	addIcon(ICON_TRANSPORT_NEXT, TRANSPORT_NEXT_SVG);
	addIcon(ICON_TRANSPORT_TO_END, TRANSPORT_TO_END_SVG);
	addIcon(ICON_ADD_CIRCLE, ADD_CIRCLE_SVG);
	addIcon(ICON_LAYOUT_SELECTOR, LAYOUT_SELECTOR_SVG);
	addIcon(ICON_FILTER_LIST, FILTER_LIST_SVG);
	addIcon(ICON_TAG_EDIT, TAG_EDIT_SVG);
	addIcon(ICON_BOOK_OPEN, BOOK_OPEN_SVG);
	addIcon(ICON_BOOK_SPINE, BOOK_SPINE_SVG);
	addIcon(ICON_CONTINUOUS_MODE, CONTINUOUS_MODE_SVG);
	addIcon(ICON_CONTINUOUS_MODE_EXIT, CONTINUOUS_MODE_EXIT_SVG);
}
