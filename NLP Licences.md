# NLP Licences

Story Context (the dossier / recommend panel) bundles a local English NLP model.
There is **one local model and still no network fetch** — Obsidian's offline
install path (`main.js` + `manifest.json` + `styles.css`) carries the model
inside the bundled plugin.

---

## winkNLP

- **Author:** GRAYPE Systems Private Limited / winkJS
- **Source:** https://github.com/winkjs/wink-nlp
- **Licence:** MIT License — *see [MIT License](#mit-license) below*

---

## wink-eng-lite-web-model

- **Author:** GRAYPE Systems Private Limited / winkJS
- **Source:** https://github.com/winkjs/wink-eng-lite-web-model
- **Licence:** MIT License — *see [MIT License](#mit-license) below*
- **Notes:** Browser/web build of the English lite model (~890KB packaged). Lazy-loaded
  on first open of the Story Context panel; never fetched at runtime.

---

## MIT License

```
MIT License

Copyright (c) GRAYPE Systems Private Limited

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
