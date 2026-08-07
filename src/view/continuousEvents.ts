import { Events, type App, type EventRef } from "obsidian";

/**
 * Cross-view coordination for continuous read-and-write mode (continuous-mode hand-off brief §2,
 * corrected): the sidebar (menus — the live position indicator and the scroll-to transport) and
 * the main-pane read view (the manuscript itself, nothing else) are separate ItemView instances
 * with no direct reference to one another, so they coordinate through these two custom workspace
 * events rather than a shared handle. `Workspace` extends the base `Events` class but re-declares
 * `on` with overloads for its own fixed event names only, so custom event names are routed through
 * that base class explicitly rather than cast past `Workspace`'s narrower overload set.
 */
function events(app: App): Events {
	return app.workspace;
}

/** Fired by ContinuousReadView whenever it opens, its tracked chapter changes, or it closes. */
export const CONTINUOUS_MODE_EVENT = "storyforge:continuous-mode";

export type ContinuousModePayload = { active: true; bookFolderName: string; filename: string } | { active: false };

export function emitContinuousMode(app: App, payload: ContinuousModePayload): void {
	events(app).trigger(CONTINUOUS_MODE_EVENT, payload);
}

export function onContinuousMode(app: App, handler: (payload: ContinuousModePayload) => void): EventRef {
	return events(app).on(CONTINUOUS_MODE_EVENT, handler as (...data: unknown[]) => unknown);
}

/** Fired by the sidebar's live-position tiles and scroll-to transport to command the read view. */
export const CONTINUOUS_SCROLL_EVENT = "storyforge:continuous-scroll-to";

export interface ContinuousScrollPayload {
	bookFolderName: string;
	filename: string;
}

export function emitContinuousScrollTo(app: App, payload: ContinuousScrollPayload): void {
	events(app).trigger(CONTINUOUS_SCROLL_EVENT, payload);
}

export function onContinuousScrollTo(app: App, handler: (payload: ContinuousScrollPayload) => void): EventRef {
	return events(app).on(CONTINUOUS_SCROLL_EVENT, handler as (...data: unknown[]) => unknown);
}
