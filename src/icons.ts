import { addIcon } from "obsidian";

export const ICON_UNPLACED = "sf-archive-drawer";
export const ICON_ARCHIVE = "sf-box";
export const ICON_UNARCHIVE = "sf-inbox-download";
export const ICON_CODEX = "sf-earth-fill";
export const ICON_SERIES = "sf-library";
export const ICON_BOOK = "sf-book";
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

const INBOX_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.75 12H6a2 2 0 0 1 2 2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2a2 2 0 0 1 2-2h3.25" /><path d="M15.25 2.75h-6.5a6 6 0 0 0-6 6v6.5a6 6 0 0 0 6 6h6.5a6 6 0 0 0 6-6v-6.5a6 6 0 0 0-6-6Z" /></g></svg>`;

const BOX_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.382 8.813v8.5c0 .845.344 1.656.957 2.253a3.3 3.3 0 0 0 2.308.934h8.706c.866 0 1.696-.336 2.308-.934a3.15 3.15 0 0 0 .957-2.253v-8.5m0-5.313H4.382c-.901 0-1.632.714-1.632 1.594v2.125c0 .88.73 1.593 1.632 1.593h15.236c.901 0 1.632-.713 1.632-1.593V5.094c0-.88-.73-1.594-1.632-1.594" /></svg>`;

const ARROW_OUT_UP_SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M13 16V9h4l-5-6l-5 6h4v7z" /><path fill="currentColor" d="M19 19H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2z" /></svg>`;

const EARTH_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="currentColor" d="M21.95 10.105v-.15a10.27 10.27 0 0 0-10-8.19a10.14 10.14 0 0 0-7 2.78l-.21.19a.1.1 0 0 0 0 .05a10.23 10.23 0 0 0 6.86 17.45h.4a10.26 10.26 0 0 0 10.25-10.25a10 10 0 0 0-.3-1.88m-9.94 10.66a12.2 12.2 0 0 1-.61-3.44c.11-1.52-1.21-1.66-1.78-1.72c-.86-.09-1.43-.15-1.43-1.88c.029-.898.119-1.794.27-2.68c.33-2.3.7-4.86-1.72-6.11a8.72 8.72 0 0 1 5.14-1.67a8.6 8.6 0 0 1 2 .23a3.6 3.6 0 0 1-.18 1.49c-1.16.33-1.18 1.85-1.2 3.62c.043.983-.058 1.967-.3 2.92a1.9 1.9 0 0 0 .76 2.38c.545.32 1.168.482 1.8.47a3.72 3.72 0 0 0 2.67-1.05a4 4 0 0 0 1.12-2.19q.045-.162.06-.33a.7.7 0 0 1 .29 0c.28 0 .65 0 1 .06h.62a8.72 8.72 0 0 1-8.54 9.9z"/></svg>`;

const LIBRARY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z" fill="none"/><path fill="currentColor" d="M64 480H48a32 32 0 0 1-32-32V112a32 32 0 0 1 32-32h16a32 32 0 0 1 32 32v336a32 32 0 0 1-32 32m176-304a32 32 0 0 0-32-32h-64a32 32 0 0 0-32 32v28a4 4 0 0 0 4 4h120a4 4 0 0 0 4-4ZM112 448a32 32 0 0 0 32 32h64a32 32 0 0 0 32-32v-30a2 2 0 0 0-2-2H114a2 2 0 0 0-2 2Z"/><rect width="128" height="144" x="112" y="240" fill="currentColor" rx="2" ry="2"/><path fill="currentColor" d="M320 480h-32a32 32 0 0 1-32-32V64a32 32 0 0 1 32-32h32a32 32 0 0 1 32 32v384a32 32 0 0 1-32 32m175.89-34.55l-32.23-340c-1.48-15.65-16.94-27-34.53-25.31l-31.85 3c-17.59 1.67-30.65 15.71-29.17 31.36l32.23 340c1.48 15.65 16.94 27 34.53 25.31l31.85-3c17.59-1.67 30.65-15.71 29.17-31.36"/></svg>`;

const BOOK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.75 16.401a1.15 1.15 0 0 0 1.16 1.15a16.7 16.7 0 0 1 3.535.333c1.64.204 3.204.81 4.555 1.761V6.442A10.24 10.24 0 0 0 7.445 4.68a16.6 16.6 0 0 0-3.6-.322a1.15 1.15 0 0 0-1.074 1.15zm18.5 0a1.15 1.15 0 0 1-1.16 1.15a16.7 16.7 0 0 0-3.535.333c-1.64.204-3.204.81-4.555 1.761V6.442a10.24 10.24 0 0 1 4.555-1.762a16.6 16.6 0 0 1 3.6-.322a1.15 1.15 0 0 1 1.073 1.15z"/></svg>`;

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

/** Registers storyForge's custom Lucide-style icons so `setIcon` can address them by id. */
export function registerCustomIcons(): void {
	addIcon(ICON_UNPLACED, INBOX_SVG);
	addIcon(ICON_ARCHIVE, BOX_SVG);
	addIcon(ICON_UNARCHIVE, ARROW_OUT_UP_SQUARE_SVG);
	addIcon(ICON_CODEX, EARTH_FILL_SVG);
	addIcon(ICON_SERIES, LIBRARY_SVG);
	addIcon(ICON_BOOK, BOOK_SVG);
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
}
