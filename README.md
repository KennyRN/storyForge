# storyForge
Storytelling plugin by volcanicMole
(updated to 0.9.0, see What's New after What can storyForge do?)

## Why storyForge?
I got fed up of having storytelling apps which were pretty but functionally useless, or functionally powerful, but ugly.

Then came the new generation of web apps: great, they were pretty and functional... Just they forced you to use a web browser (a real dangerous thing for me).

So I delved into Obsidian again and vibe coded storyForge to turn obsidian into a perfect storytelling app for me! And if I found it useful, I'm sure others would too, so I decided to release it. But, yes, I know it's only a pre-release as there's so much more I want to add to this plugin. Though, if I don't stop here and use it for a while, I doubt I'll get any storytelling done...

## What can storyForge do?
There's a welcome note built into the plugin which gives a more detailed breakdown, but here is a short description of what you get within:
1. standard Obsidian elements hidden so that it becomes a minimalist app (these can be easily turned on again).
2. formatting options such as size, colours, and fonts built in to make it easier to adjust things to your liking (but you'll need a theme as the options are for smaller elements only).
3. library panel where you can switch between series and novel views.
4. codex panel to hold all your story lore notes
5. data security features: import and export of settings, backup your story automatically, full manual backup of entire vault and plugins, and _no matter what_ storyForge only views your manuscript (after it creates it) and for your lore files it can only rename them (and create them, of course, but renaming is only done so you can use wikilinks).

Basically the idea is: Obsidian + storyForge + a theme = fully functional storytelling app

One which can be enhanced by using other plugins found within the Obsidian ecosystem!

## What's New in 0.9.0
I've added functionality to the right sidebar. There's 3 panels there. First is the 'dash' or 'blank' panel. This is an empty panel to give you a minimal writing space, whilst keeping the editor centred and access to the left sidebar.

Second panel is the Story Context panel, this is a major change (and the first one which comes up when you open storyForge), in it you've got text analysis from your chapter shown in your sidebar. This sidebar remains visible if you leave the chapter so you can change things in your codex without losing this information.

Third panel is the Archive panel, I've removed the access to archive from the storyForge panel and moved them here. I'm in two minds wether this should be always on, toggle off, or toggle on...

## Starting with storyForge
After installing, turn the plugin on, and a welcome screen pops up which asks to give the name of your series (or if you're telling a standalone novel, there's an option there to set that too).

Once you give the series name to storyForge you're brought into Obsidian proper with storyForge's welcome note already populated in the Codex to explain more. But briefly there's two default panels, the storyForge panel which houses all the features of the plugin and at the top in the library pane you can add novels, then within a novel, chapters to be placed into your series / novel (at first they're unplaced, so just drag them to their proper location and all be ready for your masterpiece).

To add a novel / chapter look for the add icon on the Unplaced pane's header row.

The other panel is the Tools panel. A fancy way of saying this is Obsidian's ribbon given a slight bit of fancying up (adding the titles of the buttons of the ribbon), so anything you can do in the ribbon you can do here.

## External Vault Access Disclosure
This plugin does access files outside the vault for backup purposes (both the library and your plugin settings), to import plugin settings, and to add novel covers to your books.

If you're running an automated security/behavior scan against storyForge, here's what it'll likely flag and why:
- **Node `fs` access** and **full vault enumeration**: both come from the same disclosed backup feature above — writing a zip file to a folder outside the vault requires Node's `fs`, and building that zip requires reading every file in the vault via Obsidian's own `vault.getFiles()`/`vault.adapter.list()` APIs. Neither is used anywhere else in the plugin.

## Privacy and vault access
storyForge writes only inside its own `_sf-backstage` folder — there's no code path anywhere in the plugin that writes to your prose, codex, or any other vault content.

The backup feature is the one exception to that otherwise scoped read access. When a backup runs — whether you start it manually or via the schedule you've enabled — it reads every file in the vault in order to zip it up. That's the sole reason the plugin enumerates vault files, and it happens only in `src/backup.ts`.

Backups are written to a local folder you choose. Nothing leaves your machine, and storyForge makes no network requests.
