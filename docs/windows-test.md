# Windows preview: a test for someone who has never used storyForge

Thank you for trying this. It is a **preview**: the Mac version has been used for months; this one has been tested only by automatic tests on a Windows machine at GitHub, and by you. **Please keep a copy of anything you care about.** Use the sample project (`storyForge-sample-project.zip` on the release page), **never your own writing**, for this test.

## Before you start

1. Download the installer and the sample project (`storyForge-sample-project.zip`) from the release page.
2. Windows will say **"Windows protected your PC"** because the installer is not signed. Choose **More info**, then **Run anyway**. The installer needs no administrator rights.
3. Unzip the sample project somewhere ordinary, for example your Documents folder (not a folder OneDrive is syncing for the first part of the test).

## The test

Tick each step; write down anything odd, with a screenshot.

- [ ] **Install and start.** storyForge opens to a start screen.
- [ ] **Open the sample project** (Open Project…, choose the unzipped folder). A series with two novels appears.
- [ ] **Write.** Open a chapter, type a few sentences, including a quote mark and two hyphens. Wait three seconds.
- [ ] **Quit and reopen.** Close with the window's X, start storyForge again, open the project from the list. Your words are there.
- [ ] **Quit a second way.** Type a few words, then at once use File ▸ Exit. Reopen: the words are there.
- [ ] **A Codex entry.** On the Codex tab, open "Zoë Åberg". The accents show correctly. Rename another entry, say "Jane" to "Janet". Check that a chapter that mentioned her now links to "Janet".
- [ ] **A name Windows doesn't allow.** Try a new note called `NUL`, then one called `What?`. Each should be refused with a sentence saying why.
- [ ] **Archive and unarchive** a Codex entry.
- [ ] **A setting.** In Settings change the data colour; it changes at once and stays after a restart.
- [ ] **Back up.** Story ▸ Back Up Now. Find the backup in File Explorer: the project folder, then `_sf-backup`.
- [ ] **Notepad.** Close the chapter's editor view. Open the chapter's file (in `_story-library`) in Notepad, change a word, save. storyForge should pick up the change within a second or two without asking.
- [ ] **A file in use.** Open another chapter file in Notepad and leave it open, then type in that chapter in storyForge. The words should still save.
- [ ] **Shutting down.** Type a few words in a chapter, then immediately choose Start ▸ Power ▸ Shut down (or Sign out). After starting again, open the project: are the words there?
- [ ] **OneDrive** (only if you use it). Move the project into a OneDrive folder set to "Always keep on this device", open it, write, quit, reopen.

## Please report

- Your Windows version (Settings ▸ System ▸ About), and whether it is Windows 10 or 11.
- Whether the installer had to download WebView2 (a short extra step during install).
- Each step that did not work, what you saw, and a screenshot of anything that looks wrong (squashed or cut-off text, a gap at the top of the window, odd fonts).
- Anything that felt slow.

Send it to Kenny. Thank you.

## What is in the sample project

Made from scratch by `scripts/sample-project.mjs`; every word is invented. **Nothing that exists only for the app's own tests is in it** (no deliberately broken cover images, no legacy or unknown keys, no comments the app has to keep): a series, "The Sample Series", with two novels ("The Harbour Wakes", three chapters; "The Long Night", two chapters), planned lengths, a Codex of five notes in two folders (Jane, Sam, "Zoë Åberg" with accents, one with a long name, Harbour) and one archived note (Retired), with types, aliases and one link between notes. Nothing else.

## Things to look at that the automatic tests cannot judge

- The look of the text: Windows draws fonts differently from the Mac. Does anything look too heavy, cut off or misaligned?
- The top of the window: Windows' own title bar is used, and the panels start right under it. Does the top of the panels feel cramped against the bar?
- Red underlines under misspelt words in the chapter.
- Typing: curly quotes, `--` becoming a dash, `~th` offering "the Right Honourable…" and Tab accepting it. Press Ctrl+Z straight after one of these: you should get back exactly what you typed. Then Ctrl+Shift+Z or Ctrl+Y: the correction again.
- Ctrl+click on a link to a Codex entry, and Ctrl+Return with the cursor on it, open the entry (on the Codex tab and the storytelling side).
