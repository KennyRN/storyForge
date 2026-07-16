import { App, TFile } from "obsidian";
import { CODEX_ROOT } from "./paths";
import { createCodexNote } from "./codex";

export const WELCOME_NOTE_FILENAME = "storyForge Welcome.md";

export const WELCOME_NOTE_CONTENT = `# [[Welcome to storyForge]]!

I created storyForge as a one-stop-shop plugin for storytelling: to turn Obsidian into a dedicated storytelling app. All the advantages of Obsidian and all the advantages of a storytelling app. (With hopefully few of the disadvantages of either. 😂)

## 🪟 The storyForge Window
This text is in the editor, and to the left (or right if you move the panel) is the storyForge panel. There's 4 panes of the window:
1. Library pane
2. Unplaced pane
3. Codex pane
4. Stats pane

### 📚 Library pane
This is where you organise your stories.

There's a series → book → chapter hierarchy.

Within a series, and within a novel, you can drag-to-reorder. To make this even more useful is auto-numbering (just type # where you want the auto-number to be) and chapters, and novels, will auto-number.

(As an added bonus, if you're writing in series, there's also a title / subtitle splitting: just type // ) (Oh, and if you're not writing in a series, that's fine, but if your suposed-standalone novel turns into the start of an epic ten novel series then head to settings and just switch it to a series (simple-as!))

Within the novel library pane there's a plot button. Click on it and up pops the window... So, no, sorry it doesn't plot the story for you. But here you can add a cover; write the synopsis, back cover copy, or just ideas you have for the story; and below there's an area where each chapter has its own section where you can keep track of what's going on in the story. There's also an option to add the PoV character and location of the scene (but you'll need to set these in the Codex pane).

### 🚧 Unplaced pane
This is a holding pen, a staging area, for your novels or chapters (depending upon what library pane you're in). All new chapters and novels get placed here, and remain here, until you decide to move them into the series / novel proper.

Also here you'll find the Archive. This removes the archived files or novels from view, but allows you to hunt for them again if you ever want to find those nuggets of treasure within them. (As for deleting files, there shouldn't be a way within the storyForge panel for that to occur: your words are precious, and even if you don't want them they deserve to be celebrated in their own way.)

### 🌍 Codex pane
A dedicated area with virtual folders to organise all your story lore. This is completely freeform so go wild within here!

Archiving rather than deleting, as mentioned above within the storyForge panel, because there is no method of deleting files.

This is a folder within the Obsidian vault called *Codex/*  If you put your files in here then they'll appear within storyForge, so it's easy to move your markdown worldbuilding files into storyForge. Just be aware that codex houses a virtual folder, so all the files need to kept in the base folder location, otherwise they might not be seen.

Right clicking on a note allows you to set what type of note you've created. Some of these notes can then be linked to your chapters (via the plot window).

### 📈 Stats pane
Tucked right at the very bottom, there if you want it, not obvious if you don't is the stats pane. It gives you live wordcounts for chapter and novel. You can also change the view so you got a daily or weekly wordcount showing (because not all of us work day-to-day).

There's also a wordcount log which keeps track of your progress over time.

## 🧭 Focus & Navigation
The storyForge panel has a highlight feature which shows what chapter or codex item you currently have open.

### 🎨 Customisation
As I wanted this a one-stop-plugin there's lots of features behind the scenes which mirror other Obsidian plugins:
- **Tools panel:** this deserves a mention. As standard I've hidden Obsidian's ribbon, but it can be useful when you use plugins, so instead of hiding the ribbon completely I've had it moved into the Tools panel. What you see is Obsidian's ribbon with the names associated with the tools and plugins formatted to make it look better within a panel rather than just being a narrow strip along the edge.
- **Colour palette and mode:** these give you common colour schemes and their standard colours for you to pick colours from. If you don't use any of those themes, or just want to have your own colour options, there's a custom option which allows you to define 5 colours to use within storyForge and Obsidian.
- **Text style:** this contains overrides for your theme's default text styles in things like fonts (there's a number built into storyForge), colours, size, font weight, font decorations. (In Heading 1 there's an extra feature of Hiding the links for Heading 1: this is a me-thing. A tip from me to you, set up a Heading 1 link and when you rename the file the header name changes too! Yes, Obsidian does show file names in the editor windows now, but I've turned that off as standard so chapters are just nice and simple text. This also allows you to have your note header formatted how you like!) (And, yes, I've linked this Heading 1, so feel free and rename this file and see the title change...)
- **storyForge interface:** this is where you find the options to customise the foreground appearance of the storyForge panel.
- **Hide Obsidian interface elements:** maybe, unlike me, you'd prefer a busier writing platform. If so, that's okay, and that's why every Obsidian element I've had turned off can be found in here and can be turned on again. The exception to this is the ribbon which is hidden by the *Use tools panel* setting. This can be found at the top of the settings page.

### 🛤️ Storytelling aids
- There's a cycling guide to help tell you when to go back up and cycle over your story again. If you want to know more look for Dean Wesley Smith and Writing into the Dark (there's blog posts, books, and videos about this method of storytelling).

## ⚠️ Data Safety ⚠️
- There's an automatic backup feature which has various options to allow you to keep a snapshot of the progress of your novel. This only backup the files in your Obsidian vault. (You have an option or daily, weekly, or whenever Obsidian is open.)
- As part of that, there's also a manual backup button which backup everything within the Obsidian folder, including the hidden files.
- Due to limitations the backup can only be done on a desktop Obsidian app.
- There's also a setting to export and import your storyForge settings. So you can craft things perfectly to your liking and then export them so future storyForge plugins can be styled exactly the same. (I mean, if you're like me, you have far more ideas and half-started stories than you know what to do with...)
- And this file, though you can't delete it natively within storyForge, can be archived. But if you did delete and want it back, well, just pop into settings and ask for it to be recreated again!
- This leads to one final thing to note: storyForge, other than creating files (and renaming files in the codex pane (and codex pane only)), cannot touch the files which are held within the library and codex folders. And storyForge doesn't have any delete function in its code. I set this up like this to make sure your masterpiece is kept as safe as I can make it, especially if you use the automatic backup and follow proper backup procedures (321 backup is a good place to start).
	- And how storyForge saves how your marvellous masterpiece manuscript is structured in a markdown file in YAML code. Which is to say easy to read if you open that file (which is hidden from view in storyForge panel as you don't need it). So if you ever decide to take your story into another app or plugin or some other kind of future method then it's all there for you to easily move over.
`;

/**
 * Idempotent: returns the existing note untouched if `Codex/storyForge Welcome.md` already exists,
 * so hand-edited content is never overwritten. Otherwise creates it and registers it into codex.md's
 * virtual folder tree at root, via the same path createCodexNote() uses for user-created notes.
 */
export async function ensureWelcomeNote(app: App): Promise<TFile> {
	const path = `${CODEX_ROOT}/${WELCOME_NOTE_FILENAME}`;
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) return existing;
	return createCodexNote(app, null, { filename: WELCOME_NOTE_FILENAME, content: WELCOME_NOTE_CONTENT });
}
