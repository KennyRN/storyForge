import { addIcon } from "obsidian";

export const ICON_UNPLACED = "sf-archive-drawer";
export const ICON_NEW_FILE = "sf-file-plus";
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
export const ICON_TOOLS = "sf-dashboard-3";

const INBOX_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.75 12H6a2 2 0 0 1 2 2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2a2 2 0 0 1 2-2h3.25" /><path d="M15.25 2.75h-6.5a6 6 0 0 0-6 6v6.5a6 6 0 0 0 6 6h6.5a6 6 0 0 0 6-6v-6.5a6 6 0 0 0-6-6Z" /></g></svg>`;

const INBOX_PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path stroke-linejoin="round" d="M2.75 12H6a2 2 0 0 1 2 2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2a2 2 0 0 1 2-2h3.25" /><path d="M21.25 10.375v4.875a6 6 0 0 1-6 6h-6.5a6 6 0 0 1-6-6v-6.5a6 6 0 0 1 6-6h4.875" /><path stroke-miterlimit="10" d="M18.745 2.75v5M16.25 5.255h5" /></g></svg>`;

const BOX_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.382 8.813v8.5c0 .845.344 1.656.957 2.253a3.3 3.3 0 0 0 2.308.934h8.706c.866 0 1.696-.336 2.308-.934a3.15 3.15 0 0 0 .957-2.253v-8.5m0-5.313H4.382c-.901 0-1.632.714-1.632 1.594v2.125c0 .88.73 1.593 1.632 1.593h15.236c.901 0 1.632-.713 1.632-1.593V5.094c0-.88-.73-1.594-1.632-1.594" /></svg>`;

const INBOX_DOWNLOAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path stroke-linejoin="round" d="M2.75 12H6a2 2 0 0 1 2 2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2a2 2 0 0 1 2-2h3.25" /><path d="M21.25 10.375v4.875a6 6 0 0 1-6 6h-6.5a6 6 0 0 1-6-6v-6.5a6 6 0 0 1 6-6h4.875" /><path stroke-miterlimit="10" d="M18.957 7.75v-5" /><path stroke-linejoin="round" d="m16.664 5.645l1.967 1.967a.46.46 0 0 0 .652 0l1.967-1.967" /></g></svg>`;

const EARTH_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="currentColor" d="M21.95 10.105v-.15a10.27 10.27 0 0 0-10-8.19a10.14 10.14 0 0 0-7 2.78l-.21.19a.1.1 0 0 0 0 .05a10.23 10.23 0 0 0 6.86 17.45h.4a10.26 10.26 0 0 0 10.25-10.25a10 10 0 0 0-.3-1.88m-9.94 10.66a12.2 12.2 0 0 1-.61-3.44c.11-1.52-1.21-1.66-1.78-1.72c-.86-.09-1.43-.15-1.43-1.88c.029-.898.119-1.794.27-2.68c.33-2.3.7-4.86-1.72-6.11a8.72 8.72 0 0 1 5.14-1.67a8.6 8.6 0 0 1 2 .23a3.6 3.6 0 0 1-.18 1.49c-1.16.33-1.18 1.85-1.2 3.62c.043.983-.058 1.967-.3 2.92a1.9 1.9 0 0 0 .76 2.38c.545.32 1.168.482 1.8.47a3.72 3.72 0 0 0 2.67-1.05a4 4 0 0 0 1.12-2.19q.045-.162.06-.33a.7.7 0 0 1 .29 0c.28 0 .65 0 1 .06h.62a8.72 8.72 0 0 1-8.54 9.9z"/></svg>`;

const LIBRARY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z" fill="none"/><path fill="currentColor" d="M64 480H48a32 32 0 0 1-32-32V112a32 32 0 0 1 32-32h16a32 32 0 0 1 32 32v336a32 32 0 0 1-32 32m176-304a32 32 0 0 0-32-32h-64a32 32 0 0 0-32 32v28a4 4 0 0 0 4 4h120a4 4 0 0 0 4-4ZM112 448a32 32 0 0 0 32 32h64a32 32 0 0 0 32-32v-30a2 2 0 0 0-2-2H114a2 2 0 0 0-2 2Z"/><rect width="128" height="144" x="112" y="240" fill="currentColor" rx="2" ry="2"/><path fill="currentColor" d="M320 480h-32a32 32 0 0 1-32-32V64a32 32 0 0 1 32-32h32a32 32 0 0 1 32 32v384a32 32 0 0 1-32 32m175.89-34.55l-32.23-340c-1.48-15.65-16.94-27-34.53-25.31l-31.85 3c-17.59 1.67-30.65 15.71-29.17 31.36l32.23 340c1.48 15.65 16.94 27 34.53 25.31l31.85-3c17.59-1.67 30.65-15.71 29.17-31.36"/></svg>`;

const BOOK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.75 16.401a1.15 1.15 0 0 0 1.16 1.15a16.7 16.7 0 0 1 3.535.333c1.64.204 3.204.81 4.555 1.761V6.442A10.24 10.24 0 0 0 7.445 4.68a16.6 16.6 0 0 0-3.6-.322a1.15 1.15 0 0 0-1.074 1.15zm18.5 0a1.15 1.15 0 0 1-1.16 1.15a16.7 16.7 0 0 0-3.535.333c-1.64.204-3.204.81-4.555 1.761V6.442a10.24 10.24 0 0 1 4.555-1.762a16.6 16.6 0 0 1 3.6-.322a1.15 1.15 0 0 1 1.073 1.15z"/></svg>`;

const FILTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="1.5" d="M21.25 12H8.895m-4.361 0H2.75m18.5 6.607h-5.748m-4.361 0H2.75m18.5-13.214h-3.105m-4.361 0H2.75m13.214 2.18a2.18 2.18 0 1 0 0-4.36a2.18 2.18 0 0 0 0 4.36Zm-9.25 6.607a2.18 2.18 0 1 0 0-4.36a2.18 2.18 0 0 0 0 4.36Zm6.607 6.608a2.18 2.18 0 1 0 0-4.361a2.18 2.18 0 0 0 0 4.36Z"/></svg>`;

const BOOK_PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 20.25c0 .414.336.75.75.75h10.652C17.565 21 18 20.635 18 19.4v-1.445M5 20.25A2.25 2.25 0 0 1 7.25 18h10.152q.339 0 .598-.045M5 20.25V6.2c0-1.136-.072-2.389 1.092-2.982C6.52 3 7.08 3 8.2 3h9.2c1.236 0 1.6.437 1.6 1.6v11.8c0 .995-.282 1.425-1 1.555M9.5 10h5M12 7.5v5"/></svg>`;

const DASHBOARD_CHART_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-width="1.5"><rect width="18.5" height="18.5" x="2.75" y="2.75" rx="6"/><path stroke-linecap="round" stroke-linejoin="round" d="m7 15l2.45-3.26a1 1 0 0 1 1.33-.25L13.17 13a1 1 0 0 0 1.37-.29L17 9"/></g></svg>`;

const EXCHANGE_B_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M19.75 6.75h-12a4 4 0 0 0-4 4v2m16-1v2a4 4 0 0 1-4 4h-12"/><path d="m16.75 9.75l3-3l-3-3m-10 11l-3 3l3 3"/></g></svg>`;

const CALENDAR_2_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 4.625H7a4 4 0 0 0-4 4v8.75a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4v-8.75a4 4 0 0 0-4-4m-14 6h18m-4-8v4m-10-4v4m.375 7.515h1.028m7.194 0h1.028m-5.139 0h1.028m-5.139 3.084h1.028m7.194 0h1.028m-5.139 0h1.028"/></svg>`;

const DASHBOARD_3_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.318 2.75H4.682A1.93 1.93 0 0 0 2.75 4.682v3.885A1.93 1.93 0 0 0 4.682 10.5h14.636a1.93 1.93 0 0 0 1.932-1.932V4.682a1.93 1.93 0 0 0-1.932-1.932M8.567 13.5H4.682a1.93 1.93 0 0 0-1.932 1.933v3.885a1.93 1.93 0 0 0 1.932 1.932h3.885a1.93 1.93 0 0 0 1.932-1.932v-3.885A1.94 1.94 0 0 0 8.567 13.5m10.751 0h-3.885a1.94 1.94 0 0 0-1.932 1.933v3.885a1.93 1.93 0 0 0 1.932 1.932h3.885a1.933 1.933 0 0 0 1.932-1.932v-3.885a1.93 1.93 0 0 0-1.932-1.932"/></svg>`;

/** Registers storyForge's custom Lucide-style icons so `setIcon` can address them by id. */
export function registerCustomIcons(): void {
	addIcon(ICON_UNPLACED, INBOX_SVG);
	addIcon(ICON_NEW_FILE, INBOX_PLUS_SVG);
	addIcon(ICON_ARCHIVE, BOX_SVG);
	addIcon(ICON_UNARCHIVE, INBOX_DOWNLOAD_SVG);
	addIcon(ICON_CODEX, EARTH_FILL_SVG);
	addIcon(ICON_SERIES, LIBRARY_SVG);
	addIcon(ICON_BOOK, BOOK_SVG);
	addIcon(ICON_FILTER, FILTER_SVG);
	addIcon(ICON_BOOK_PLUS, BOOK_PLUS_SVG);
	addIcon(ICON_DASHBOARD_CHART, DASHBOARD_CHART_SVG);
	addIcon(ICON_EXCHANGE, EXCHANGE_B_SVG);
	addIcon(ICON_CALENDAR, CALENDAR_2_SVG);
	addIcon(ICON_TOOLS, DASHBOARD_3_SVG);
}
