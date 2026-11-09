import { redo } from "@codemirror/commands";
import type { KeyBinding } from "@codemirror/view";

/**
 * Shift-Ctrl-Z is redo on Windows too (Brief 22). CodeMirror's own history keymap binds it only on the Mac and Linux
 * (Windows has Ctrl-Y), so on Windows the key fell through to the browser's native redo, which replays its own
 * stack, not ours, and can leave the wrong text. On the Mac this is the binding it already has.
 */
export const redoKeymap: readonly KeyBinding[] = [{ key: "Mod-Shift-z", run: redo, preventDefault: true }];
