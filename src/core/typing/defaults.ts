/** The starting lists of the typing aids (docs/typing-aids.md §8, decision 46). All are editable in settings. */

/**
 * Words that begin with an apostrophe, not an opening quote: `’tis`, `’em`. `cause` and `em` can also open ordinary
 * speech (‘Cause and effect,’ she said); they stay in the list by Kenny's ruling, and a quoted word (`‘em’`) is left
 * alone whatever the list says.
 */
export const DEFAULT_ELISIONS: readonly string[] = ["tis", "twas", "twere", "twill", "twould", "em", "til", "cause"];

/** The starting special characters: the ligatures. */
export const DEFAULT_SPECIAL_CHARACTERS: readonly string[] = ["æ", "Æ", "œ", "Œ"];

/** A one-click addition in settings for Old English and Middle English spellings. */
export const OLD_ENGLISH_GROUP: readonly string[] = ["ð", "Ð", "þ", "Þ", "ƿ", "Ƿ", "ȝ", "Ȝ"];
