/** The purposes the stylesheets define (theme/purposes.css). The lint test checks every use in src/ui against this list. */
export const PURPOSES = [
	"editor-bg",
	"panel-bg",
	"raised-bg",
	"raised-hover",
	"border",
	"decoration",
	"text",
	"text-muted",
	"accent",
	"text-on-accent",
	"focus-ring",
	"selection",
	"trouble",
	"data-fill",
	"data-overrun",
	"scrim",
	"shadow",
] as const;

export type Purpose = (typeof PURPOSES)[number];

export const purposeVar = (p: Purpose): string => `var(--purpose-${p})`;
