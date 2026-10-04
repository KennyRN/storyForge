# storyForge
Storytelling plugin by volcanicMole

Obsidian + storyForge + (formatForge) + a theme = fully functional storytelling app.

***⚠️ WARNING: this plugin no longer creates an external backup!*** Backups are zips kept inside your vault (see [Keeping your words safe](#keeping-your-words-safe)).

## 0.17.0 Update
The big one this time is continuous mode: you can now write in it, not just read it.
- **Continuous mode is a real manuscript editor.** The whole book opens as one manuscript and you can write straight through it, chapter to chapter, without the old click-to-edit dance. Each chapter still saves to its own file (and only the chapters you actually change). The depth guide sits at the start of every chapter, the cycling guide runs across the whole book, prose dressing and the emphasis keys work as you type, and you can start a new chapter from inside the manuscript (right click → *New chapter after this*, the control at the end of the manuscript, or the command). On mobile it stays read-only.
- **Series overview** now shows word-count bars on each placed novel's card, and keeps itself up to date as chapters and novels change.
- **Novel overview** has new chapter cards with three tiers of detail (pick how much you want to see in settings), and the word-count bar is now the button. Hover over a bar for the word count and the chapter's description.
- **Story Context**
  - the Novel tab gets the same data-bar chapter cards
  - the Notebook now opens on the Codex first, you can rename notes, and there's a new prompt for building a dossier
  - the Codex has been dropped from the Chapter tab (it lives in the Notebook now)
  - "Recommend" is gone for good: everything is called Story Context now, and your old settings are moved over automatically. ⚠️ The command id changed, so if you'd set a hotkey for opening it you'll need to set it again.
- **Codex notes are no longer scoped to a single book.** All your lore is visible across the whole series. (Any old `book:` lines in your notes are left alone; they just don't do anything any more.)
- **A sliding ink indicator** on the Notebook and Archive source rails, the Codex `#tag` rails and the continuous-mode toggle. Clicking an open codex page again now closes it.
- **The storytelling panel's project pane** has been redesigned, and the novel title modal is now just the name, with the series dice inline.
- **titleForge** has had a huge overhaul:
  - pick a section (series, novels or web fiction), then a genre and sub genre: there are now 41 sub genres across 7 genres
  - the series section generates series names only, built from a study of 875 real series
  - character names in titles are invented (nameForge-style) rather than borrowed from real people, and you can point it at your own nameForge pack in titleForge settings
  - it won't hand you a real book's title, and plurals and agreement are fixed ("Centuries", not "Centurys"; "Where the Wolves Rise")
  - word lists are much fuller, and genres now share vocabulary with their parent genre instead of replacing it
  - an "about this title" window shows how each title was built
  - adding your own words is now one markdown file in your vault (`user enhanced lexicon.md`) rather than hand-editing JSON

## Why storyForge?
I got fed up of having storytelling apps which were pretty but functionally useless, or functionally powerful, but ugly.

Then came the new generation of web apps: great, they were pretty and functional... Just they forced you to use a web browser (a real dangerous thing for me).

So I delved into Obsidian again and vibe coded storyForge to turn Obsidian into a perfect storytelling app for me! And if I found it useful, I'm sure others would too, so I decided to release it. But, yes, I know it's only a pre-release as there's so much more I want to add to this plugin. Though, if I don't stop here and use it for a while, I doubt I'll get any storytelling done...

## What can storyForge do?
There's a welcome note built into the plugin which gives a more detailed breakdown, but here is a short description of what you get:
- **Writing and organising:** storytelling mode keeps you in the chapter; the storyForge face lays out the codex, series, novel and chapter.
- **Shaping the story:** hold novels and chapters until they're ready, drag them into place, and let auto-numbering, title splits and titleForge do the fiddly bits.
- **Seeing it whole:** series and novel overviews with covers, synopses, word-count bars, chapter cards and plot threads.
- **Continuous mode:** the whole book as one manuscript you can write straight through.
- **Story Context:** who and what each chapter mentions, names missing from the codex, and a dossier of everything the book says about anyone.
- **Codex and Notebook:** lore in virtual folders, typed and tagged, with your ideas kept separately in the Notebook.
- **Keeping track:** word counts and history, plot threads, tags, and the cycling and depth guides.
- **Making it yours:** palettes, interface sizing, the Tools panel, and as much or as little of Obsidian as you want.
- **Keeping your words safe:** nothing is ever deleted, backups run on a schedule you set, and everything stays plain markdown.

### titleForge
Title and series-name generators, open from the ribbon or the command palette ("Open titleForge"). Pick a section (series, novels or web fiction), a genre and a sub genre, and it'll give you titles shaped like that tradition's (Anglophone, Japanese light novel, and Chinese / Korean / Vietnamese / Indonesian / Thai web serials, plus a world fiction genre). Every generator only ever outputs English: titles *shaped like* another tradition's, not translations of one. You can add your own words in one markdown file in your vault, so adding a word never needs a plugin update. It's a self-contained subplugin, documented on its own terms in `src/titleforge/README.md`.

### formatForge
storyForge has formatting options for its own chrome (sizes, colours). The optional **formatForge** plugin adds manuscript fonts, colours and dividers, and hosts the shared formatting UI while it's enabled.

Basically the idea is: Obsidian + storyForge + (formatForge) + a theme = fully functional storytelling app

One which can be enhanced by using other plugins found within the Obsidian ecosystem: especially the Forge Family of plugins!

## Starting with storyForge
After installing, turn the plugin on, and a welcome screen pops up which asks for the name of your series (or if you're telling a standalone novel, there's an option there to set that too). You can also apply a template or config from your vault here.

Once you give the series name to storyForge you're brought into Obsidian proper. If you chose to create a welcome note, that's waiting in the Codex; otherwise you're on chapter 1 of your first novel. Briefly there's two default panels. The storyForge panel houses all the features of the plugin, and at the top in the library pane you can add novels, then within a novel, chapters to be placed into your series / novel (at first they're unplaced, so just drag them to their proper location and all be ready for your masterpiece).

To add a novel / chapter look for the add icon on the Unplaced pane's header row.

The other panel is the Tools panel. A fancy way of saying this is Obsidian's ribbon given a slight bit of fancying up (adding the titles of the buttons of the ribbon), so anything you can do in the ribbon you can do here.

On the right there's more options. There's a blank tab to hide things on the right to have a more focused screen. There's also a Story Context tab which uses local dumb-code to help you with understanding what's going on within a scene or chapter. This dumb-code also produces a dossier about a codex item so you can see most, if not all, of the comments brought up about them during the story so far. There's also a novel overview with space for the cover, a synopsis, and a place to see where the chapter takes place, who is the PoV character, and what happens.

Also over here, there's the Archive section. As storyForge cannot delete files within your codex or library, this is where you can have them hidden, unseen unless one day you want to go back to them. (To add files to the archive, right click on the chapter or codex lore item and select archive.)

## Keeping your words safe
Your words are precious, and even if you don't want them they deserve to be celebrated in their own way. So there's no delete function anywhere in storyForge's code: things you don't want get archived instead.

- There's an automatic backup feature which keeps a snapshot of the progress of your novel: daily, weekly, or whenever Obsidian is open. Backups are saved as zip files inside your vault at `_sf-backup/`.
- There's also a manual backup button which backs up everything within the Obsidian vault, including hidden files like your settings folder.
- You can export and import your storyForge settings, or a complete project pack (preferences, types & tags, and plot threads too), so you can craft things perfectly to your liking and move them between vaults.
- How your manuscript is structured is saved in a markdown file in YAML. Which is to say easy to read if you open it, so if you ever decide to take your story into another app or plugin or some other kind of future method then it's all there for you to easily move over.

Backups living inside your vault means they sync with your vault, but it also means they're not a backup *away* from your vault. Please follow proper backup procedures as well (321 backup is a good place to start).

## Privacy and vault access
storyForge writes only inside `_backstage/storyforge/` (plugin state) and `_sf-backup/` (backups and recovery files), plus two narrow exceptions at the story library's root, `series.md` and each book's `novel-<code>.md`, which describe your novels without being manuscript prose themselves. Beyond that, the only writes are for creating new files, renaming codex files (for wikilink purposes), and saving what you type in continuous mode.

storyForge never writes prose on its own initiative. The one time it writes to a chapter is when you type in continuous mode, where it saves your own typing (and nothing else) through a single guarded path:
- **Only your book's placed chapters.** It saves only to chapter files on the spine of the book open in continuous mode. It refuses everything else: unplaced and archived chapters, other books, your codex, and the rest of your vault.
- **Never over a file that changed elsewhere.** Before each save it checks the chapter file still holds what continuous mode last saw. If something else changed it in the meantime (a normal editor tab, sync, another plugin), the file on disk is left exactly as it is, and what you'd typed goes to a recovery file in `_sf-backup/recovery/` instead, with a notice telling you where. Nothing is merged and nothing is overwritten.
- **A backup first.** Before the first save of each continuous-mode session, storyForge takes a backup zip into `_sf-backup/`.
- **Nothing unchanged.** A chapter you don't edit is never written, and frontmatter and line endings are kept exactly as they were.

On mobile, continuous mode is read-only and writes nothing.

If you're running an automated security/behaviour scan against storyForge, here's what it'll likely flag and why:
- **Vault enumeration** (recommendation): building a backup zip requires walking vault folders via Obsidian's `vault.adapter.list()` API. That happens only in `src/backup.ts`, only when a backup runs, and never uploads anything. The plugin does **not** use Node's `fs` module or write outside the vault.

The backup feature is the one exception to otherwise scoped read access. When a backup runs (whether you start it manually or via the schedule you've enabled) it reads vault files in order to zip them into `_sf-backup/`. The `_sf-backup/` folder itself is always excluded so zips never nest previous backups. That's the sole reason the plugin walks vault folders.

Backups stay inside your vault (so they sync with Obsidian Sync / your chosen sync tool if you use one). Nothing leaves your machine via storyForge, and storyForge makes no network requests.

# Previous Update Notes
## 0.16.1 Update
- redesign of some of the visual layout, not only on the main storyForge interface but also within some of the menus (update 0.16.1 extended this to the text format menu)
- added a new method of filtering within the Codex, using `#tags`, just add `#tags` within your normal markdown document. Then in the new codex tags window (found on the codex pane, it's the one with the `#` on it), set an icon and check the use checkbox
  - sitting beneath the other Codex icons is the one for your tag, nice and easy, and you're not limited to just having a single type visible

## 0.15.0 Update
- First-run onboarding now sets up your series (or standalone novel), can apply a template or config from the vault, and only creates the welcome note if you ask for it. If you skip the welcome note, you land on chapter 1.
- You can export and import a complete project pack, plus preferences, types & tags, and plot threads, so a setup can move between vaults.
