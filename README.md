***⚠️ WARNING: this plugin no longer creates an external backup!***

Instead it creates a folder within the vault and backs the vault up in there. The change was due to Obsidian's automated warning that the vault allows external access of your computer and my frustration that I had to mentally ignore the warning time and time again.

This change does mean that it should now be able to work on mobile devices.

Embedded custom fonts (and full manuscript typography) now live in the optional **formatForge** companion plugin. The split keeps storyForge’s bundle smaller for Obsidian Sync. (Sadly this means it's no longer a one-stop-shop but it's close enough with the advantage that formatForge can now work on other vaults for a simple-to-use theme formatting alteration plugin.)

# storyForge
Storytelling plugin by volcanicMole

## Why storyForge?
I got fed up of having storytelling apps which were pretty but functionally useless, or functionally powerful, but ugly.

Then came the new generation of web apps: great, they were pretty and functional... Just they forced you to use a web browser (a real dangerous thing for me).

So I delved into Obsidian again and vibe coded storyForge to turn obsidian into a perfect storytelling app for me! And if I found it useful, I'm sure others would too, so I decided to release it. But, yes, I know it's only a pre-release as there's so much more I want to add to this plugin. Though, if I don't stop here and use it for a while, I doubt I'll get any storytelling done...

## What can storyForge do?
There's a welcome note built into the plugin which gives a more detailed breakdown, but here is a short description of what you get within:
1. standard Obsidian elements hidden so that it becomes a minimalist app (these can be easily turned on again).
2. formatting options for storyForge’s own chrome (sizes, colours). Optional **formatForge** adds manuscript fonts/colours/dividers and hosts the shared formatting UI while enabled.
3. library panel where you can switch between series and novel views.
4. codex panel to hold all your story lore notes
5. data security features: import and export of settings, backup your story automatically, full manual backup of entire vault and plugins, and _no matter what_ storyForge only views your manuscript (after it creates it) and for your lore files it can only rename them (and create them, of course, but renaming is only done so you can use wikilinks).
6. **titleForge**: nine title & series generators, one per literary tradition (Anglophone, Japanese light novel, Chinese/Korean/Vietnamese/Indonesian/Thai web serial, and a comparative world-literary bench). Every generator only ever outputs English — titles *shaped like* another tradition's, not translations of one. Open it from the ribbon or the command palette ("Open titleForge"); the word lists are hand-editable JSON in your vault, so adding a word never needs a plugin update. It's a self-contained subplugin, documented on its own terms in `src/titleforge/README.md`.

Basically the idea is: Obsidian + storyForge + (formatForge) + a theme = fully functional storytelling app

One which can be enhanced by using other plugins found within the Obsidian ecosystem: especially the Forge Family of plugins!

## Starting with storyForge
After installing, turn the plugin on, and a welcome screen pops up which asks to give the name of your series (or if you're telling a standalone novel, there's an option there to set that too).

Once you give the series name to storyForge you're brought into Obsidian proper with storyForge's welcome note already populated in the Codex to explain more. But briefly there's two default panels, the storyForge panel which houses all the features of the plugin and at the top in the library pane you can add novels, then within a novel, chapters to be placed into your series / novel (at first they're unplaced, so just drag them to their proper location and all be ready for your masterpiece).

To add a novel / chapter look for the add icon on the Unplaced pane's header row.

The other panel is the Tools panel. A fancy way of saying this is Obsidian's ribbon given a slight bit of fancying up (adding the titles of the buttons of the ribbon), so anything you can do in the ribbon you can do here.

On the right there's more options. There's a blank tab to hide things on the right to have a more focused screen. There's also a Story Context tab which uses local dumb-code to help you with understanding what's going on within a scene or chapter. This dumb-code also produces a dossier about a codex item so you can see most, if not all, of the comments brought up about them during the story so far. There's also a novel overview with space for the cover, a synopsis, and a place to see where the chapter takes place, who is the PoV character, and what happens.

Also over here, there's the Archive section. As storyForge cannot delete files within your codex or library, this is where you can have them hidden, unseen unless one day you want to go back to them. (To add files to the archive, right click on the chapter or codex lore item and select archive.)

## Privacy and vault access
storyForge writes only inside `_backstage/storyforge/` (plugin state) and `_sf-backup/` (backup zips) — plus two narrow exceptions at the story library's root, `series.md` and each book's `novel-<code>.md`, which describe your novels without being manuscript prose themselves. There's no code path anywhere in the plugin that writes to your existing prose, codex, or any other vault content: the only writes are for creating new files, renaming codex files (for wikilink purposes), and in the backstage, backup, and those two library-root metadata paths.

If you're running an automated security/behavior scan against storyForge, here's what it'll likely flag and why:
- **Vault enumeration** (recommendation): building a backup zip requires walking vault folders via Obsidian's `vault.adapter.list()` API. That happens only in `src/backup.ts`, only when a backup runs, and never uploads anything. The plugin does **not** use Node's `fs` module or write outside the vault.

The backup feature is the one exception to otherwise scoped read access. When a backup runs — whether you start it manually or via the schedule you've enabled — it reads vault files in order to zip them into `_sf-backup/`. The `_sf-backup/` folder itself is always excluded so zips never nest previous backups. That's the sole reason the plugin walks vault folders.

Backups stay inside your vault (so they sync with Obsidian Sync / your chosen sync tool if you use one). Nothing leaves your machine via storyForge, and storyForge makes no network requests.
