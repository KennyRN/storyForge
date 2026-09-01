import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONTRACT_VERSION = 12;
const root = dirname(fileURLToPath(import.meta.url));
const hostApiPath = resolve(root, "src/hostApi.ts");
const formattingApiPath = resolve(root, "src/formattingApi.ts");
const snapshotPath = resolve(root, "linked-formatting-keys.json");
const formatForgeRoot = process.env.FORMATFORGE_ROOT
	? resolve(process.env.FORMATFORGE_ROOT)
	: resolve(root, "../../../formatForge");
const generatedPath = resolve(
	formatForgeRoot,
	"src/storyforgeLinkedFormattingKeys.generated.ts",
);
const formatForgeSnapshotPath = resolve(formatForgeRoot, "linked-formatting-keys.json");
const bridgePath = resolve(formatForgeRoot, "src/storyforgeBridge.ts");
const checkOnly = process.argv.includes("--check");
const formatForgePresent = existsSync(resolve(formatForgeRoot, "package.json"));

let hostApi = readFileSync(hostApiPath, "utf8");
if (!checkOnly) {
	hostApi = hostApi.replace(
		"\nconst LINKED_FORMATTING_KEYS = [",
		"\nexport const LINKED_FORMATTING_KEYS = [",
	);
	writeFileSync(hostApiPath, hostApi);
}

const match = hostApi.match(
	/export const LINKED_FORMATTING_KEYS = \[([\s\S]*?)\] as const;/,
);
if (!match) throw new Error("Could not locate LINKED_FORMATTING_KEYS in hostApi.ts");
const keys = [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
if (new Set(keys).size !== keys.length) throw new Error("Linked key contract contains duplicates");

const valueTypes = parseValidatorValueTypes(hostApi, keys);
const snapshot = `${JSON.stringify({ contractVersion: CONTRACT_VERSION, keys, valueTypes }, null, "\t")}\n`;
const generated = buildGenerated(CONTRACT_VERSION, keys, valueTypes);

if (checkOnly) {
	if (!existsSync(snapshotPath)) {
		throw new Error(
			"linked-formatting-keys.json is missing; run npm run sync:formatting-contract",
		);
	}
	if (readFileSync(snapshotPath, "utf8") !== snapshot) {
		throw new Error(
			"linked-formatting-keys.json is stale; run npm run sync:formatting-contract",
		);
	}
	if (formatForgePresent) {
		if (!existsSync(formatForgeSnapshotPath)) {
			throw new Error(
				"formatForge linked-formatting-keys.json is missing; run npm run sync:formatting-contract",
			);
		}
		if (readFileSync(formatForgeSnapshotPath, "utf8") !== snapshot) {
			throw new Error(
				"formatForge linked-formatting-keys.json is stale; run npm run sync:formatting-contract",
			);
		}
		if (!existsSync(generatedPath) || readFileSync(generatedPath, "utf8") !== generated) {
			throw new Error(
				"formatForge linked-key contract is stale; run npm run sync:formatting-contract",
			);
		}
	}
	const sibling = formatForgePresent ? " and formatForge generated copy" : "";
	console.log(`Verified ${keys.length} shared linked formatting keys${sibling}.`);
	process.exit(0);
}

writeFileSync(snapshotPath, snapshot);

if (formatForgePresent) {
	writeFileSync(formatForgeSnapshotPath, snapshot);
	writeFileSync(generatedPath, generated);

	let formattingApi = readFileSync(formattingApiPath, "utf8");
	formattingApi = formattingApi.replace(
		/\/\*\* Keys formatForge may read\/write on storyForge[\s\S]*?(?=export type FontResolveResult)/,
		`/** Keys formatForge may read/write on storyForge (stored in SF data.json). */
export type SfLinkedFormattingKey =
	(typeof import("./hostApi").LINKED_FORMATTING_KEYS)[number];

/** Linked-key snapshot: each key is typed from \`StoryForgePluginSettings\`. */
export type LinkedFormattingValues = {
	[K in SfLinkedFormattingKey]: import("./main").StoryForgePluginSettings[K];
};

`,
	);
	writeFileSync(formattingApiPath, formattingApi);

	let bridge = readFileSync(bridgePath, "utf8");
	bridge = bridge.replace(
		/\/\/ ── Linked key contract \(generated from storyForge host\) ─+[\s\S]*?(?=\/\/ ── Formatting API surface)/,
		`// ── Linked key contract (generated from storyForge host) ──────────────────

export {
	LINKED_FORMATTING_KEYS,
	STORYFORGE_FORMATTING_CONTRACT_VERSION,
} from "./storyforgeLinkedFormattingKeys.generated";
export type { LinkedFormattingValues, SfLinkedFormattingKey } from "./storyforgeLinkedFormattingKeys.generated";

`,
	);
	writeFileSync(bridgePath, bridge);
	console.log(`Synced ${keys.length} linked formatting keys to formatForge.`);
} else {
	console.log(
		`Wrote ${keys.length} linked formatting keys snapshot (formatForge sibling not present).`,
	);
}

function tsTypeForValidator(expr) {
	const name = expr.replace(/\(.*$/, "").trim();
	switch (name) {
		case "isBoolean":
			return "boolean";
		case "isEditorSize":
		case "isFiniteNumber":
			return "number";
		case "isPaletteColorArray":
			return "ReadonlyArray<{ name: string; hex: string }>";
		case "isString":
		case "isColorString":
		case "isOneOf":
			return "string";
		default:
			throw new Error(`Unknown linked validator: ${expr}`);
	}
}

function parseValidatorValueTypes(source, expectedKeys) {
	const validatorsMatch = source.match(
		/const LINKED_SETTING_VALIDATORS: Record<SfLinkedFormattingKey, ValuePredicate> = \{([\s\S]*?)\n\};/,
	);
	if (!validatorsMatch) {
		throw new Error("Could not locate LINKED_SETTING_VALIDATORS in hostApi.ts");
	}
	const parsed = {};
	for (const [, key, expr] of validatorsMatch[1].matchAll(/^\t(\w+): ([^,]+),?$/gm)) {
		parsed[key] = tsTypeForValidator(expr.trim());
	}
	const extra = Object.keys(parsed).filter((key) => !expectedKeys.includes(key));
	if (extra.length) {
		throw new Error(`Validator keys not in LINKED_FORMATTING_KEYS: ${extra.join(", ")}`);
	}
	const ordered = {};
	for (const key of expectedKeys) {
		if (!(key in parsed)) {
			throw new Error(`Missing validator for linked key ${key}`);
		}
		ordered[key] = parsed[key];
	}
	return ordered;
}

function buildGenerated(contractVersion, keyList, types) {
	const valueTypeLines = keyList.map((key) => `\t${key}: ${types[key]};`).join("\n");
	return `/**
 * GENERATED by storyForge/sync-formatting-contract.mjs.
 * Source of truth: storyForge/src/hostApi.ts LINKED_FORMATTING_KEYS.
 * Do not edit this file by hand.
 */
export const STORYFORGE_FORMATTING_CONTRACT_VERSION = ${contractVersion} as const;

export const LINKED_FORMATTING_KEYS = ${JSON.stringify(keyList, null, "\t")} as const;

export type SfLinkedFormattingKey = (typeof LINKED_FORMATTING_KEYS)[number];

export type LinkedFormattingValues = {
${valueTypeLines}
};
`;
}
