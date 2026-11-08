/** Which system the window runs on (Brief 22). The Mac is the default; only Windows differs. */
export const isWindows: boolean = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

/** The "primary" modifier of a click: ⌘ on the Mac, Ctrl on Windows. */
export const primaryModifier = (event: { metaKey: boolean; ctrlKey: boolean }): boolean => (isWindows ? event.ctrlKey : event.metaKey);

/** The last part of a folder path, whichever separator it uses (a Windows project root has backslashes). */
export const folderName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

if (typeof document !== "undefined") document.documentElement.dataset.platform = isWindows ? "windows" : "mac";
