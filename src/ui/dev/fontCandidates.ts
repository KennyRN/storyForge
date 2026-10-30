/**
 * Development aid for decision 56 (Brief 10): the Mac's built-in fonts that contain ƿ Ƿ ȝ Ȝ ǣ, drawn in place beside SN Pro
 * so Kenny can choose the fallback by eye. It exists only in a build made with VITE_SF_FONT_CANDIDATES=1 (a local H2
 * build); in every other build the import in main.ts is compiled out and the production bundle has none of this
 * (test/releaseBuild.test.ts). Never shipped.
 */
const NAMES = "Ƿynn ȝeoƿulf ǣlfƿine Ȝorn";
const LATIN = "Windows Harbour";

const CANDIDATES: { label: string; stack: string }[] = [
	{ label: "SN Pro alone (what the Mac substitutes: temporary)", stack: `"SN Pro"` },
	{ label: "Arial (sans)", stack: `"SN Pro", "Arial"` },
	{ label: "Tahoma (sans)", stack: `"SN Pro", "Tahoma"` },
	{ label: "Geneva (sans)", stack: `"SN Pro", "Geneva"` },
	{ label: "Lucida Grande (sans)", stack: `"SN Pro", "Lucida Grande"` },
	{ label: "Microsoft Sans Serif (sans)", stack: `"SN Pro", "Microsoft Sans Serif"` },
	{ label: "Times New Roman (serif)", stack: `"SN Pro", "Times New Roman"` },
	{ label: "Baskerville (serif)", stack: `"SN Pro", "Baskerville"` },
	{ label: "Courier New (mono)", stack: `"SN Pro", "Courier New"` },
	{ label: "New York (lacks ƿ Ƿ ȝ Ȝ: the Mac substitutes)", stack: `"SN Pro", "New York"` },
	{ label: "Helvetica Neue (lacks only ƿ)", stack: `"SN Pro", "Helvetica Neue"` },
];

export function mountFontCandidates(): void {
	const panel = document.createElement("div");
	panel.id = "sf-font-candidates";
	panel.className = "sf-codex-tree";
	panel.style.cssText =
		"position:fixed;right:12px;top:12px;z-index:9999;width:760px;max-height:calc(100vh - 24px);overflow:auto;padding:10px 12px;" +
		"background:var(--purpose-raised-bg);border:1px solid var(--purpose-border);border-radius:8px;font-size:14px;line-height:1.3";
	for (const c of CANDIDATES) {
		const row = document.createElement("div");
		row.style.cssText = "display:flex;flex-direction:column;padding:4px 0;border-bottom:1px solid var(--purpose-border)";
		const label = document.createElement("div");
		label.textContent = c.label;
		label.style.cssText = "font:12px var(--font-ui);color:var(--purpose-text-muted)";
		const sample = document.createElement("div");
		sample.className = "sf-codex-file";
		sample.style.whiteSpace = "nowrap";
		sample.style.fontFamily = c.stack;
		sample.innerHTML = `<span>${NAMES}</span><span style="font-style:italic;margin-left:14px">${NAMES}</span><span style="font-weight:700;margin-left:14px">${NAMES}</span><span style="margin-left:14px;color:var(--purpose-text-muted)">${LATIN}</span>`;
		row.append(label, sample);
		panel.append(row);
	}
	document.body.append(panel);
}
