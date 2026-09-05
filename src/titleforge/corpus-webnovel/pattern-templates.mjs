// @ts-nocheck
/**
 * pattern-templates.mjs — the EDITORIAL layer, deliberately separate from the
 * code-derived corpus stats. freeze.mjs decides WHICH families exist and their
 * weights from the data; this file supplies the human judgement the data can't:
 * template wording, the "why this shape" note, and any new lexicon slots the
 * frame needs. Every template here is written to pass the engine's own lints
 * (article agreement, indexed repeats), and every new slot is justified.
 *
 * Keyed by family id from the classifier. Only families that freeze.mjs marks
 * as a promoted GAP are actually emitted by derive.mjs; the rest sit dormant.
 *
 * Slot reuse: role, rank, placeBare already exist in westernSerial.ts and are
 * reused. New slots are listed under `newSlots` and merged additively.
 */

export const GAP_PATTERNS = {
	"regression-rebirth": {
		id: "regression-rebirth",
		label: "[Rebirth Marker] [Role]",
		templates: [
			"{rebirth} {role}",
			"Return of the {rank} {role}",
			"The {role} Who {rebirthTail}",
		],
		genres: ["litrpg", "progression", "isekai", "cultivation"],
		note: "The rebirth marker is the whole premise: the reader is promised a protagonist who already knows how the story ends. The single most load-bearing frame in anglophone web fiction after the bare class-role.",
		exemplarPrefer: /^(reincarnat|reborn|return of|becoming|i became|the second life)/i,
		// exemplar filled by derive.mjs from a verified corpus title
		newSlots: {
			rebirth: [
				"Reincarnated as the #litrpg #progression #isekai #cultivation",
				"Reborn as the #litrpg #progression #isekai #cultivation",
				"I Became the #litrpg #progression #isekai #cultivation",
				"Becoming the #litrpg #progression #isekai #cultivation",
				"The Second Life of the #litrpg #progression #isekai #cultivation",
				"Transmigrated into the #litrpg #progression #isekai #cultivation",
				// corpus-mined (Stage 4.1): "I Reincarnated as a Noble Girl Villainess...",
				// "Oh Great! I was Reincarnated as a Farmer" (article normalised to fit
				// the {rebirth} {role} grammar)
				"I Reincarnated as the #litrpg #progression #isekai #cultivation",
				"Oh Great, I Was Reincarnated as the #litrpg #progression #isekai #cultivation",
			],
			// 0 of 6 attested in the raw corpus (all editorial); a full re-read of the
			// 21-row regression-rebirth family found no further "The {role} Who ..."
			// instances to mine, so this list is unchanged — exhaustive means "every
			// attested entry," not "pad it out."
			rebirthTail: [
				"Lived Twice #litrpg #progression #isekai #cultivation",
				"Refused to Die #litrpg #progression #isekai #cultivation",
				"Came Back Wrong #litrpg #progression #isekai #cultivation",
				"Would Not Stay Dead #litrpg #progression #isekai #cultivation",
				"Kept the Patch Notes #litrpg #progression #isekai #cultivation",
				"Got a Second Save File #litrpg #progression #isekai #cultivation",
			],
		},
	},

	"interrogative-hook": {
		id: "interrogative-hook",
		label: "[Conversational Opener] the [Role]?",
		templates: [
			"{interro} the {role}?",
			"{interro} the {rank} {role}?",
		],
		genres: ["cosy", "litrpg", "isekai", "cultivation"],
		note: "A question or aside addressed straight to the reader. Signals comedy and a low-solemnity register; the hook is tone, not stakes. Sits badly next to the sincere Wattpad register — keep them apart.",
		exemplarPrefer: /\?$/,
		newSlots: {
			interro: [
				"So What If I'm #cosy #litrpg #isekai #cultivation",
				"What Do You Mean I'm #cosy #litrpg #isekai #cultivation",
				"Turns Out I'm #cosy #litrpg #isekai #cultivation",
				"So I'm #cosy #litrpg #isekai #cultivation",
				"Why Is Everyone Obsessed With #cosy #litrpg #isekai #cultivation",
				// corpus-mined (Stage 4.1): "Awakened As A Dungeon Core?"
				"Awakened as the #cosy #litrpg #isekai #cultivation",
			],
		},
	},

	"possessive-relation": {
		id: "possessive-relation",
		label: "The [Owner]'s [Noun]",
		templates: [
			"The {owner}'s {relObject}",
			"My {owner}'s {relObject}",
		],
		genres: ["romance", "litrpg", "dungeon", "cosy"],
		note: "The protagonist named by who owns them or what they hold. Two registers share one shape: the fantasy/dungeon streak (the alliterative \"The Crafter's ...\") and the huge binge-romance-app streak (\"The Alpha's Mate\", \"The CEO's Contract Wife\"). Crossed the gate once the corpus was scaled; the romance-app bloc is what gives it its dominant register.",
		exemplarPrefer: /'s /,
		// Stage 4.1: cap lowered 4 -> 3. The romance-app over-sample (the original
		// weightCapReason below) still holds, but a second, compounding factor
		// showed up once this pattern's own draw share was measured against its
		// (then-untagged, 12x14-word) slot pool: at weight 4 it could reach ~40% of
		// draws under a narrow genre+platform filter (e.g. romance+webnovel) while
		// still the *only* pattern pulling from those two dedicated slots. Now that
		// owner/relObject are both genre-tagged and mined out to their full corpus
		// attestation (see newSlots below), the vocabulary problem is fixed
		// independently — but the weight was still tied for highest in the file, so
		// bring it down to match dungeon-anchor's cap rather than leave two
		// over-sampled patterns at different caps for the same reason.
		weightCap: 3,
		weightCapReason: "romance-app possessive titles were topically over-sampled (searched for CEO/alpha possessives); real but not representative of an organic platform mix. Compounding factor found in Stage 4.1: uncapped weight plus a narrow, untagged slot pool measurably dominated draws under romance+webnovel — capped further even after widening/tagging the vocabulary, since the over-sampling itself is unchanged.",
		newSlots: {
			owner: [
				// romance register
				"Alpha #romance",
				"Alpha King #romance",
				"Luna #romance",
				"CEO #romance",
				"Billionaire #romance",
				"Duke #romance",
				"Sovereign #romance",
				"Heir #romance",
				"Werewolf #romance",
				"Exiled Noble #romance",
				"Girl #romance",
				"Soldier #romance",
				// fantasy / dungeon register
				"Crafter #litrpg #dungeon #cosy",
				"Necromancer #litrpg #dungeon",
				"Archmage #litrpg #dungeon",
				"Warden #litrpg #dungeon",
				"Tyrant #litrpg #dungeon",
				"Anarchist #litrpg #dungeon",
				"Butcher #litrpg #dungeon",
				"Artificer #litrpg #dungeon #cosy",
				"Beekeeper #litrpg #dungeon #cosy",
				"Gorgon #litrpg #dungeon",
				"Sorcerer #litrpg #dungeon",
				"Adventurer #litrpg #dungeon #cosy",
				"Ranger #litrpg #dungeon #cosy",
				"Grimm #litrpg #dungeon",
				"Snake #litrpg #dungeon",
				"Goddess #litrpg #dungeon #cosy",
				"Dungeon #litrpg #dungeon",
			],
			relObject: [
				// romance register
				"Mate #romance",
				"Bride #romance",
				"Contract Wife #romance",
				"Rejected Mate #romance",
				"Contract Bride #romance",
				"Prodigal Wife #romance",
				"Wrong Bride #romance",
				"Beloved Wife #romance",
				"Substitute Ex-Wife #romance",
				"Human Mate #romance",
				"Slave Mate #romance",
				"Sick Wife #romance",
				"Heartsong #romance",
				"Bad Boys #romance",
				// fantasy / dungeon register
				"Cookbook #litrpg #dungeon",
				"Ledger #litrpg #dungeon",
				"Gambit #litrpg #dungeon",
				"Apprentice #litrpg #dungeon",
				"Throne #litrpg #dungeon",
				"Blessing #litrpg #dungeon",
				"Masquerade #litrpg #dungeon",
				"Defense #litrpg #dungeon",
				"Town #litrpg #dungeon",
				"Guide to the Apocalypse #litrpg #dungeon",
				"Last Trick #litrpg #dungeon",
				"Rise #litrpg #dungeon",
				"War #litrpg #dungeon",
				// register-neutral (attested across both blocs)
				"Secret #romance #litrpg #dungeon #cosy",
				"Revenge #romance #litrpg #dungeon #cosy",
				"Regret #romance #litrpg #dungeon #cosy",
				"Reckoning #romance #litrpg #dungeon #cosy",
				"Grudge #romance #litrpg #dungeon #cosy",
				"Daughter #romance #litrpg #dungeon #cosy",
				"Life #romance #litrpg #dungeon #cosy",
				"Oath #romance #litrpg #dungeon #cosy",
				"Summons #romance #litrpg #dungeon #cosy",
				"Doomsday Scenario #romance #litrpg #dungeon #cosy",
				"Heart #romance #litrpg #dungeon #cosy",
				"Lie #romance #litrpg #dungeon #cosy",
			],
		},
	},

	"system-bracket": {
		id: "bracket-tag",
		label: "[Core Title] [Genre Tag]",
		templates: [
			"The {rank} {role} [{bracketTag}]",
			"{placeBare} [{bracketTag}]",
			"{monster} Dungeon [{bracketTag}]",
		],
		genres: ["litrpg", "progression", "dungeon"],
		platforms: ["royalroad", "scribblehub", "webnovel"],
		note: "The bracketed genre tag welded to the title — a Royal Road discoverability move (readers filter by tag, so the tag goes in the title). Barely exists in trad prose; a native web-serial artefact. Crossed the gate once the RR tracker data was folded in.",
		exemplarPrefer: /[\[(]/,
		newSlots: {
			bracketTag: [
				// litrpg register (no progression/dungeon flavour of their own)
				"LitRPG #litrpg",
				"A LitRPG Deckbuilder #litrpg",
				"An Idle LitRPG #litrpg",
				"A Cozy Apocalyptic LitRPG #litrpg",
				"GameLit #litrpg",
				"LitRPG Cultivation #litrpg",
				"Comedy LitRPG #litrpg",
				"Otome LitRPG #litrpg",
				"Sengoku LitRPG #litrpg",
				"Timeloop LitRPG #litrpg",
				"Hulking Eldritch Knight LitRPG #litrpg",
				"Slow Burn Isekai #litrpg",
				"Slow Burn Cultivation #litrpg",
				"Death Magic #litrpg",
				"Dragonslayer #litrpg",
				"Grim Dark #litrpg",
				"Yuri #litrpg",
				"Romance Harem #litrpg",
				"Slice of Life #litrpg",
				"Post-Apoc System Apocalypse #litrpg",
				// progression register
				"Kingdom Building #litrpg #progression",
				"Crafting & Kingdom-Building Fantasy #litrpg #progression",
				"Progression Fantasy #litrpg #progression",
				"Progression Fantasy Transmigration #litrpg #progression",
				"Multi-World Progression #litrpg #progression",
				"Genetic Progression Fantasy #litrpg #progression",
				"Timestop Progression LitRPG #litrpg #progression",
				"Rags-to-Riches Treasure Hunter LitRPG #litrpg #progression",
				// dungeon register
				"Dungeon Core #litrpg #dungeon",
				"Dragon-Raising Settlement-Building LitRPG #litrpg #dungeon",
				"Dungeon-Diving LitRPG Apocalypse #litrpg #dungeon",
			],
		},
	},

	"status-hook": {
		id: "status-hook",
		label: "[Status Verb] the [Beloved]",
		templates: [
			"{statusVerb} the {beloved}",
			"{statusVerb} My {beloved}",
		],
		genres: ["romance"],
		platforms: ["wattpad", "webnovel"],
		note: "The relationship-status hook that dominates the binge-romance apps (Dreame, GoodNovel, NovelCat): the title states what was done to the heroine by the love interest — rejected, married, kidnapped, sold. Fated-mate and contract-marriage machinery compressed into a headline. Firmly the sincere register; keep it away from the ironic frames.",
		exemplarPrefer: /\b(rejected|reclaimed|married|kidnapped|sold|claimed|mated|bound) (by|to)\b/i,
		newSlots: {
			statusVerb: [
				"Rejected by #romance",
				"Married to #romance",
				"Mated to #romance",
				"Kidnapped by #romance",
				"Sold to #romance",
				"Claimed by #romance",
				"Bound to #romance",
				"Promised to #romance",
				"Betrothed to #romance",
				"Abandoned by #romance",
				// corpus-mined (Stage 4.1): "Rejected and Reclaimed by the Alpha",
				// "Accidentally Married to Mr. Billionaire"
				"Reclaimed by #romance",
				"Accidentally Married to #romance",
			],
			beloved: [
				"Alpha #romance",
				"Mate #romance",
				"Luna #romance",
				"Lycan King #romance",
				"CEO #romance",
				"Billionaire #romance",
				"Rogue #romance",
				"Warlord #romance",
				"Beta #romance",
				"Don #romance",
				// shared with `owner` (possessive-relation): the same romance-authority
				// archetypes work as the object of a status-verb, not just the owner of
				// a relObject
				"Werewolf #romance",
				"Duke #romance",
				"Sovereign #romance",
				"Heir #romance",
				"Alpha King #romance",
				"Exiled Noble #romance",
				"Soldier #romance",
				"Tyrant #romance",
			],
		},
	},

	"setting-anchor": {
		id: "dungeon-anchor",
		label: "[Monster] Dungeon / [Monster] Core",
		templates: [
			"The {rank} Dungeon",
			"{monster} Dungeon",
			"{monster} Core",
		],
		genres: ["dungeon", "litrpg"],
		platforms: ["royalroad", "scribblehub", "webnovel"],
		note: "The dungeon-core naming convention: a one-word modifier welded to Dungeon or Core. Instantly legible as POV-is-the-dungeon fiction.",
		exemplarPrefer: /^\w+ (dungeon|core)$/i,
		// EDITORIAL OVERRIDE: raw share would make this the dominant frame, but that
		// is an artefact of topical over-sampling (dungeon-core was searched for
		// directly across two blocs; the sensitivity cut, which only drops
		// rr-progression, does not neutralise it). Cap the weight and record why.
		weightCap: 3,
		weightCapReason: "topical over-sample of dungeon-core; raw share not representative of organic platform mix",
		newSlots: {
			monster: [
				"Bone #dungeon #litrpg",
				"Slime #dungeon #litrpg",
				"Ember #dungeon #litrpg",
				"Obsidian #dungeon #litrpg",
				"Verdant #dungeon #litrpg",
				"Hollow #dungeon #litrpg",
				"Cinder #dungeon #litrpg",
				"Gloom #dungeon #litrpg",
				// corpus-mined (Stage 4.1): "The Station Core", "Cat Core", "Tree Dungeon",
				// "Bunker Core", "Rogue Dungeon", "The Boneless Dungeon", "The Misplaced
				// Dungeon", "Real-Time Dungeon", "The Bound Dungeon", "A Lonely Dungeon",
				// "Cultivating Dungeon"
				"Station #dungeon #litrpg",
				"Cat #dungeon #litrpg",
				"Tree #dungeon #litrpg",
				"Bunker #dungeon #litrpg",
				"Rogue #dungeon #litrpg",
				"Boneless #dungeon #litrpg",
				"Misplaced #dungeon #litrpg",
				"Real-Time #dungeon #litrpg",
				"Bound #dungeon #litrpg",
				"Lonely #dungeon #litrpg",
				"Cultivating #dungeon #litrpg",
			],
		},
	},
};
