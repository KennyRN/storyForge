import { Language, defineLanguageFacet } from "@codemirror/language";
import { markdownParser } from "../../core/markdownTree";

/** The markdown parse as a CodeMirror language: every editor's syntax tree (the dressing and the typing aids both read it). */
export const markdownLanguage = new Language(defineLanguageFacet(), markdownParser, [], "storyforge-markdown");
