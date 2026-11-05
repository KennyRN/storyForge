#!/bin/zsh
# Compiles src-tauri/icons/storyForge.icon into src-tauri/icons/Assets.car with Apple's actool (Xcode 26 or later), the way Tauri's
# bundler would. Rerun it whenever the .icon changes, and commit the result beside the .icon (AGENTS.md).
# Why not the bundler: on this Mac its own actool call failed with "Bad file descriptor" (Fix 9); the same compile from here works.
set -e
here="$(cd "$(dirname "$0")/../.." && pwd)"
icons="$here/src-tauri/icons"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -R "$icons/storyForge.icon" "$work/storyForge.icon"
mkdir "$work/out"
actool "$work/storyForge.icon" --compile "$work/out" --output-format human-readable-text --notices --warnings \
  --output-partial-info-plist "$work/out/info.plist" --app-icon storyForge --include-all-app-icons \
  --enable-on-demand-resources NO --development-region en --target-device mac --minimum-deployment-target 11.0 --platform macosx
[[ -f "$work/out/Assets.car" ]] || { echo "actool made no Assets.car"; exit 1; }
cp "$work/out/Assets.car" "$icons/Assets.car"
echo "wrote $icons/Assets.car"
