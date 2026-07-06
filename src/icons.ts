import { addIcon } from "obsidian";

export const ICON_UNPLACED = "sf-archive-drawer";
export const ICON_NEW_FILE = "sf-file-plus";
export const ICON_CODEX = "sf-earth-fill";
export const ICON_SERIES = "sf-library";
export const ICON_BOOK = "sf-book";
export const ICON_FILTER = "sf-filter";

const ARCHIVE_DRAWER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M19.194 9.079V7.821c0-.538-.216-1.054-.602-1.434a2.07 2.07 0 0 0-1.453-.594H6.86a2.07 2.07 0 0 0-1.453.594c-.386.38-.602.896-.602 1.434V9.08"/><path d="M6.861 5.793V4.779c0-.538.217-1.054.602-1.435a2.07 2.07 0 0 1 1.454-.594h6.166a2.07 2.07 0 0 1 1.454.594c.385.38.602.897.602 1.435v1.014m.781 3.043H6.08c-1.84 0-3.33 1.47-3.33 3.286v5.842c0 1.815 1.49 3.286 3.33 3.286h11.84c1.84 0 3.33-1.471 3.33-3.286v-5.842c0-1.815-1.49-3.286-3.33-3.286"/><path d="M7.889 12.893v1.014c0 .538.216 1.054.602 1.434c.385.38.908.594 1.453.594h4.112a2.07 2.07 0 0 0 1.453-.594c.386-.38.602-.896.602-1.434v-1.014"/></g></svg>`;

const FILE_PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path stroke-linejoin="round" d="M14.186 2.753v3.596c0 .487.194.955.54 1.3a1.85 1.85 0 0 0 1.306.539h4.125"/><path stroke-linejoin="round" d="M20.25 8.568v8.568a4.25 4.25 0 0 1-1.362 2.97a4.28 4.28 0 0 1-3.072 1.14h-7.59a4.3 4.3 0 0 1-3.1-1.124a4.26 4.26 0 0 1-1.376-2.986V6.862a4.25 4.25 0 0 1 1.362-2.97a4.28 4.28 0 0 1 3.072-1.14h5.714a3.5 3.5 0 0 1 2.361.905l2.96 2.722a2.97 2.97 0 0 1 1.031 2.189"/><path stroke-miterlimit="10" d="M11.57 10.424v7.116m-3.55-3.55h7.117"/></g></svg>`;

const EARTH_FILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="currentColor" d="M21.95 10.105v-.15a10.27 10.27 0 0 0-10-8.19a10.14 10.14 0 0 0-7 2.78l-.21.19a.1.1 0 0 0 0 .05a10.23 10.23 0 0 0 6.86 17.45h.4a10.26 10.26 0 0 0 10.25-10.25a10 10 0 0 0-.3-1.88m-9.94 10.66a12.2 12.2 0 0 1-.61-3.44c.11-1.52-1.21-1.66-1.78-1.72c-.86-.09-1.43-.15-1.43-1.88c.029-.898.119-1.794.27-2.68c.33-2.3.7-4.86-1.72-6.11a8.72 8.72 0 0 1 5.14-1.67a8.6 8.6 0 0 1 2 .23a3.6 3.6 0 0 1-.18 1.49c-1.16.33-1.18 1.85-1.2 3.62c.043.983-.058 1.967-.3 2.92a1.9 1.9 0 0 0 .76 2.38c.545.32 1.168.482 1.8.47a3.72 3.72 0 0 0 2.67-1.05a4 4 0 0 0 1.12-2.19q.045-.162.06-.33a.7.7 0 0 1 .29 0c.28 0 .65 0 1 .06h.62a8.72 8.72 0 0 1-8.54 9.9z"/></svg>`;

const LIBRARY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z" fill="none"/><path fill="currentColor" d="M64 480H48a32 32 0 0 1-32-32V112a32 32 0 0 1 32-32h16a32 32 0 0 1 32 32v336a32 32 0 0 1-32 32m176-304a32 32 0 0 0-32-32h-64a32 32 0 0 0-32 32v28a4 4 0 0 0 4 4h120a4 4 0 0 0 4-4ZM112 448a32 32 0 0 0 32 32h64a32 32 0 0 0 32-32v-30a2 2 0 0 0-2-2H114a2 2 0 0 0-2 2Z"/><rect width="128" height="144" x="112" y="240" fill="currentColor" rx="2" ry="2"/><path fill="currentColor" d="M320 480h-32a32 32 0 0 1-32-32V64a32 32 0 0 1 32-32h32a32 32 0 0 1 32 32v384a32 32 0 0 1-32 32m175.89-34.55l-32.23-340c-1.48-15.65-16.94-27-34.53-25.31l-31.85 3c-17.59 1.67-30.65 15.71-29.17 31.36l32.23 340c1.48 15.65 16.94 27 34.53 25.31l31.85-3c17.59-1.67 30.65-15.71 29.17-31.36"/></svg>`;

const BOOK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.75 16.401a1.15 1.15 0 0 0 1.16 1.15a16.7 16.7 0 0 1 3.535.333c1.64.204 3.204.81 4.555 1.761V6.442A10.24 10.24 0 0 0 7.445 4.68a16.6 16.6 0 0 0-3.6-.322a1.15 1.15 0 0 0-1.074 1.15zm18.5 0a1.15 1.15 0 0 1-1.16 1.15a16.7 16.7 0 0 0-3.535.333c-1.64.204-3.204.81-4.555 1.761V6.442a10.24 10.24 0 0 1 4.555-1.762a16.6 16.6 0 0 1 3.6-.322a1.15 1.15 0 0 1 1.073 1.15z"/></svg>`;

const FILTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="1.5" d="M21.25 12H8.895m-4.361 0H2.75m18.5 6.607h-5.748m-4.361 0H2.75m18.5-13.214h-3.105m-4.361 0H2.75m13.214 2.18a2.18 2.18 0 1 0 0-4.36a2.18 2.18 0 0 0 0 4.36Zm-9.25 6.607a2.18 2.18 0 1 0 0-4.36a2.18 2.18 0 0 0 0 4.36Zm6.607 6.608a2.18 2.18 0 1 0 0-4.361a2.18 2.18 0 0 0 0 4.36Z"/></svg>`;

/** Registers storyForge's custom Lucide-style icons so `setIcon` can address them by id. */
export function registerCustomIcons(): void {
	addIcon(ICON_UNPLACED, ARCHIVE_DRAWER_SVG);
	addIcon(ICON_NEW_FILE, FILE_PLUS_SVG);
	addIcon(ICON_CODEX, EARTH_FILL_SVG);
	addIcon(ICON_SERIES, LIBRARY_SVG);
	addIcon(ICON_BOOK, BOOK_SVG);
	addIcon(ICON_FILTER, FILTER_SVG);
}
