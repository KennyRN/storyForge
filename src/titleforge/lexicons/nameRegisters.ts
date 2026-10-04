import type { NameGenerator } from "../engine/types.js";

/**
 * Name registers for invented character names (`@id` lexicon entries — see `engine/names.ts`).
 *
 * Each list is a **style source**, not a pool to draw from: titleForge builds nameForge's Markov
 * model over it and invents new names in that style. Anything within one edit of a source is
 * rejected, so no name here ever appears in a title. The sources are ordinary given names of each
 * period or culture, plus title-composer's earlier curated names. None is taken from a scraped
 * title: webnovel's `hero` register deliberately leaves out the 18 protagonist names its v1.2.0
 * lexicon had lifted from real series.
 *
 * Writers can swap any register for one of their own nameForge packs in titleForge settings.
 */
export const NAME_REGISTERS = {
	fantasy: {
		label: "Fantasy",
		sources: [
			"Osric", "Brannoc", "Fintan", "Aurelia", "Emeric", "Suniva", "Aldwyn", "Carys", "Maerin", "Bevan",
			"Sela", "Rhun", "Idris", "Gwarin", "Alderic", "Corin", "Merrow", "Talia", "Aelfric", "Eadric",
			"Leofwin", "Wulfstan", "Godric", "Hereward", "Cuthbert", "Oswin", "Eadgyth", "Aelfwyn", "Hild", "Ealdgyth",
			"Rhodri", "Owain", "Cadoc", "Dafydd", "Gwenllian", "Angharad", "Rhiannon", "Bronwen", "Elowen", "Tegan",
			"Branwen", "Cormac", "Ciaran", "Niamh", "Aoife", "Deirdre", "Fergus", "Ronan", "Sigurd", "Halvard",
			"Torvald", "Ingrid", "Astrid", "Sigrun", "Ragnhild", "Eirik", "Brynja", "Ulfric", "Gunnar", "Isolde",
		],
	},
	historical: {
		label: "Historical (Georgian to Victorian)",
		sources: [
			"Marguerite", "Ottoline", "Rosalind", "Nesta", "Enid", "Josiah", "Perpetua", "Elizabeth", "Cassandra", "Harriet",
			"Charlotte", "Georgiana", "Caroline", "Louisa", "Arabella", "Henrietta", "Eleanor", "Lydia", "Catherine", "Augusta",
			"Sophia", "Philippa", "Theodosia", "Honoria", "Lavinia", "Clementine", "Beatrice", "Octavia", "Ophelia", "Matilda",
			"Edmund", "Frederick", "Edward", "Henry", "Charles", "George", "Augustus", "Bertram", "Percival", "Barnaby",
			"Tobias", "Ambrose", "Jasper", "Rupert", "Horace", "Septimus", "Thaddeus", "Algernon", "Montague", "Ralph",
			"Hugh", "Giles", "Lionel", "Cecil", "Reginald", "Humphrey", "Rowland", "Fitzroy", "Leopold", "Gilbert",
		],
	},
	ancient: {
		label: "Ancient (Roman and Greek)",
		sources: [
			"Marcus", "Lucius", "Gaius", "Quintus", "Titus", "Decimus", "Aulus", "Servius", "Gnaeus", "Publius",
			"Sextus", "Tiberius", "Cassius", "Flavius", "Valerius", "Livia", "Julia", "Claudia", "Cornelia", "Valeria",
			"Antonia", "Aemilia", "Drusilla", "Agrippina", "Fulvia", "Sabina", "Lucilla", "Calpurnia", "Alexios", "Demetrios",
			"Nikias", "Kleon", "Perikles", "Lysander", "Xanthippe", "Aspasia", "Thais", "Phaedra", "Ariadne", "Kallias",
			"Theron", "Leonidas", "Damon", "Hermia", "Philon", "Eudora", "Chloris", "Cyrene", "Andromache", "Iason",
		],
	},
	frontier: {
		label: "Frontier (Western)",
		sources: [
			"Wyatt", "Virgil", "Jesse", "Cole", "Clay", "Boone", "Hank", "Amos", "Jeb", "Silas",
			"Caleb", "Levi", "Zeke", "Rufus", "Earl", "Wade", "Hollis", "Emmett", "Judah", "Isaiah",
			"Cyrus", "Calvin", "Jedediah", "Ezekiel", "Cora", "Mattie", "Lottie", "Belle", "Josie", "Etta",
			"Pearl", "Opal", "Hattie", "Sadie", "Della", "Lula", "Annie", "Lucinda", "Abigail", "Martha",
			"Eliza", "Rebecca", "Ruth", "Esther", "Naomi", "Dolores", "Rosa", "Inez", "Consuelo", "Augustina",
		],
	},
	modern: {
		label: "Modern",
		sources: [
			"Wren", "Lorna", "Tomas", "Nadia", "Bram", "Ilse", "Jerome", "Vesna", "Hesper", "Ansel",
			"Maya", "Leah", "Chloe", "Hannah", "Zoe", "Priya", "Amara", "Sofia", "Elena", "Mira",
			"Iris", "June", "Ruby", "Tess", "Nell", "Freya", "Isla", "Clara", "Lena", "Esme",
			"Ada", "Ivy", "Daniel", "Marcus", "Theo", "Felix", "Owen", "Rhys", "Luca", "Mateo",
			"Omar", "Ezra", "Jonah", "Callum", "Rory", "Declan", "Niall", "Elliot", "Joel", "Adrian",
			"Simon", "Isaac", "Karim", "Arjun", "Kofi", "Tariq", "Ines", "Noor", "Yara", "Anya",
		],
	},
	sf: {
		label: "Science fiction",
		sources: [
			"Talia", "Ludmila", "Kestrel", "Emeric", "Sela", "Hesper", "Corin", "Vesna", "Ansel", "Nadia",
			"Kenji", "Ravi", "Ilya", "Yuki", "Arun", "Zara", "Nia", "Oren", "Soren", "Lyra",
			"Kira", "Mika", "Juno", "Cassia", "Rhea", "Anika", "Lior", "Teo", "Nikolai", "Irina",
			"Yaroslav", "Aleksei", "Mei", "Hana", "Sora", "Ren", "Amani", "Zuri", "Kwame", "Femi",
			"Noa", "Ari", "Liesel", "Anja", "Mattias", "Henrik", "Freja", "Kasimir", "Vasco", "Tamsin",
		],
	},
	gothic: {
		label: "Gothic",
		sources: [
			"Absalom", "Josiah", "Perpetua", "Merrow", "Silas", "Ezekiel", "Obadiah", "Ebenezer", "Mordecai", "Cornelius",
			"Barnabas", "Gideon", "Elias", "Malachi", "Lazarus", "Ichabod", "Roderick", "Verity", "Prudence", "Mercy",
			"Temperance", "Constance", "Hester", "Tabitha", "Jerusha", "Keziah", "Delphine", "Lenore", "Ligeia", "Morella",
			"Annabel", "Agatha", "Lucinda", "Evangeline", "Ottilie", "Wilhelmina", "Grisel", "Hepzibah", "Mehitabel", "Zillah",
			"Damaris", "Bathsheba", "Thaddeus", "Septimus", "Ambrose", "Lucius", "Honora", "Philomena", "Ursula", "Edgar",
		],
	},
	hero: {
		label: "Webnovel hero",
		sources: [
			"Max", "Sam", "Ben", "Tom", "Leo", "Kai", "Finn", "Rex", "Ash", "Cole",
			"Zack", "Ryan", "Liam", "Noah", "Ethan", "Mason", "Logan", "Lucas", "Owen", "Evan",
			"Connor", "Tyler", "Kyle", "Dylan", "Marcus", "Nate", "Luke", "Mia", "Zoe", "Lily",
			"Ava", "Ella", "Ruby", "Ivy", "Lucy", "Kate", "Tess", "Maya", "Lena", "Sara",
			"Nina", "Rose", "Iris", "Cleo", "Elise", "Freya", "Hazel", "Alice", "Gwen", "Kira",
			"Rin", "Juno", "Theo", "Hugo", "Felix", "Oscar", "Silas", "Milo", "Jonah", "Abel",
		],
	},
} satisfies Record<string, NameGenerator>;

/** The registers a spec uses, by id. */
export function registers(...ids: (keyof typeof NAME_REGISTERS)[]): Record<string, NameGenerator> {
	return Object.fromEntries(ids.map((id) => [id, NAME_REGISTERS[id]]));
}
