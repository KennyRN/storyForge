/**
 * Lazy winkNLP loader. Instantiation is deferred until the Story Context panel
 * first needs a scan — app launch and non-users of the panel pay nothing.
 * The web model is bundled into main.js (no network, no loose data file).
 */

import type { Model, WinkMethods } from "wink-nlp";

export type WinkNlp = WinkMethods;
export type WinkIts = WinkMethods["its"];
export type WinkDoc = ReturnType<WinkMethods["readDoc"]>;

let nlp: WinkNlp | null = null;
let loadPromise: Promise<WinkNlp> | null = null;

/** True once winkNLP has been instantiated this session. */
export function isNlpReady(): boolean {
	return nlp !== null;
}

/**
 * Ensures winkNLP + eng-lite-web-model are loaded. Safe to call repeatedly.
 * Requires are inside this function so esbuild's module factories stay cold
 * until first Story Context open.
 */
export async function ensureNlp(): Promise<WinkNlp> {
	if (nlp) return nlp;
	if (loadPromise) return loadPromise;
	loadPromise = Promise.resolve().then(() => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- deferred require keeps winkNLP out of the cold module graph until Story Context opens
		const winkNLP = require("wink-nlp") as (model: Model) => WinkNlp;
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- same deferred-load reason as wink-nlp above; model stays bundled, not fetched
		const model = require("wink-eng-lite-web-model") as Model;
		nlp = winkNLP(model);
		return nlp;
	});
	try {
		return await loadPromise;
	} catch (err) {
		loadPromise = null;
		throw err;
	}
}

export function getIts(instance: WinkNlp = nlp!): WinkIts {
	return instance.its;
}
