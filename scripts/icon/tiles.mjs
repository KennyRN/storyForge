import { webkit } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const b = await webkit.launch();
for (const n of ["A", "B", "C"]) {
  const anvil = readFileSync(`out/${n}/storyForge.icon/Assets/anvil.svg`, "utf8").replace(/<\?xml.*?\?>/, "");
  const quill = readFileSync(`out/${n}/storyForge.icon/Assets/quill.svg`, "utf8").replace(/<\?xml.*?\?>/, "");
  mkdirSync(`out/${n}/tiles`, { recursive: true });
  for (const size of [32, 64, 128, 256, 1024]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    const scale = size / 1024;
    await p.setContent(`<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;border-radius:${size * 0.2237}px;background:#333C43;overflow:hidden;position:relative"><div style="position:absolute;transform-origin:0 0;transform:scale(${scale})">${anvil}</div><div style="position:absolute;transform-origin:0 0;transform:scale(${scale})">${quill}</div></div></body>`);
    await p.waitForTimeout(150);
    writeFileSync(`out/${n}/tiles/${size}.png`, await p.screenshot({ omitBackground: true }));
    await p.close();
  }
  console.log(n, "tiles done");
}
await b.close();
