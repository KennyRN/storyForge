import { webkit } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
const b = await webkit.launch();
const names = { 16: ["icon_16x16"], 32: ["icon_16x16@2x", "icon_32x32"], 64: ["icon_32x32@2x"], 128: ["icon_128x128"], 256: ["icon_128x128@2x", "icon_256x256"], 512: ["icon_256x256@2x", "icon_512x512"], 1024: ["icon_512x512@2x"] };
for (const v of ["A", "B", "C"]) {
  const strip = (f) => readFileSync(`out/${v}/storyForge.icon/Assets/${f}.svg`, "utf8").replace(/<\?xml.*?\?>/, "");
  const anvil = strip("anvil"), quill = strip("quill");
  const set = `out/${v}/AppIcon.iconset`;
  mkdirSync(set, { recursive: true });
  for (const [sz, list] of Object.entries(names)) {
    const S = Number(sz), body = S * 824 / 1024, off = (S - body) / 2, k = body / 1024;
    const p = await b.newPage({ viewport: { width: S, height: S } });
    // Apple's macOS 11 template: an 824 px rounded square (radius 22.4%) centred in the 1024 px canvas, with its soft shadow.
    await p.setContent(`<body style="margin:0;background:transparent"><div style="position:absolute;left:${off}px;top:${off}px;width:${body}px;height:${body}px;border-radius:${body * 0.2237}px;background:#333C43;overflow:hidden;box-shadow:0 ${S * 10 / 1024}px ${S * 20 / 1024}px rgba(0,0,0,.45)"><div style="position:absolute;transform-origin:0 0;transform:scale(${k})">${anvil}</div><div style="position:absolute;transform-origin:0 0;transform:scale(${k})">${quill}</div></div></body>`);
    await p.waitForTimeout(120);
    const png = await p.screenshot({ omitBackground: true });
    for (const n of list) writeFileSync(`${set}/${n}.png`, png);
    await p.close();
  }
  execSync(`iconutil -c icns ${set} -o out/${v}/fallback-full.icns`);
  console.log(v, "icns made");
}
await b.close();
