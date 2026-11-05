import { webkit } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const b = await webkit.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
const draw = async (html) => { await p.setContent(`<body style="margin:0;background:#000">${html}</body>`); await p.waitForTimeout(300); return p.screenshot(); };
for (const n of ["A", "B", "C"]) {
  const ref = readFileSync(`out/${n}/reference.svg`, "utf8");
  const anvil = readFileSync(`out/${n}/storyForge.icon/Assets/anvil.svg`, "utf8").replace(/<\?xml.*?\?>/, "");
  const quill = readFileSync(`out/${n}/storyForge.icon/Assets/quill.svg`, "utf8").replace(/<\?xml.*?\?>/, "");
  const a = await draw(`<div style="position:relative;width:1024px;height:1024px">${ref}</div>`);
  const c = await draw(`<div style="position:relative;width:1024px;height:1024px;background:#333C43"><div style="position:absolute">${anvil}</div><div style="position:absolute">${quill}</div></div>`);
  writeFileSync(`out/${n}/ref.png`, a); writeFileSync(`out/${n}/layers.png`, c);
  // pixel difference, computed in the page
  const res = await p.evaluate(async ([x, y]) => {
    const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
    const [ia, ib] = await Promise.all([load("data:image/png;base64," + x), load("data:image/png;base64," + y)]);
    const cv = (i) => { const c = document.createElement("canvas"); c.width = c.height = 1024; const g = c.getContext("2d"); g.drawImage(i, 0, 0); return g.getImageData(0, 0, 1024, 1024).data; };
    const da = cv(ia), db = cv(ib); let bad = 0, max = 0;
    for (let k = 0; k < da.length; k += 4) { const d = Math.abs(da[k]-db[k]) + Math.abs(da[k+1]-db[k+1]) + Math.abs(da[k+2]-db[k+2]); if (d > 60) bad++; if (d > max) max = d; }
    return { bad, max };
  }, [a.toString("base64"), c.toString("base64")]);
  console.log(n, JSON.stringify(res));
}
await b.close();
