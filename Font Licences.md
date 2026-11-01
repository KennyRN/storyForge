# Font Licences

storyForge ships its fonts (SN Pro, and since Brief 13 five more, below), inside the app, and loads it from there (the app makes no network requests). It is used unmodified: the files are exactly as published, so the font keeps its name.

---

## SN Pro

- **Authors:** SN Pro Authors (derived from Nunito, by The Nunito Project Authors)
- **Source:** https://github.com/supernotes/sn-pro
- **Licence:** SIL Open Font License, Version 1.1
- **Files:** `src/ui/theme/fonts/SNPro-VariableRegular.woff2` and `src/ui/theme/fonts/SNPro-VariableItalic.woff2`. The combined `SNPro-Variable` file is not used.
- **Where it's used:** the chapter editor, Codex notes, the plot-note, synopsis and series-description fields, and the Codex list.
- **Copyright notice:**

```
Copyright 2024 SN Pro Authors (https://github.com/supernotes/sn-pro)
Copyright 2014 The Nunito Project Authors (https://github.com/googlefonts/nunito)
```

The full licence text is in `src/ui/theme/fonts/OFL.txt`, which is also shipped inside the app as `OFL.txt` (in the app's Resources folder).

---

## Brief 13: five more families

Chosen by the author for the storytelling side (docs/navigator.md). Each is licensed under the **SIL Open Font License, Version 1.1**, is shipped exactly as supplied (the font files are unmodified; Fraunces ships as the supplied `.woff2`, the others as the supplied `.ttf`; only the file names of Fraunces were shortened, because the supplied ones contain brackets), and is loaded from the app only. Each licence is beside its files in `src/ui/theme/fonts/<family>/OFL.txt` and shipped in the app's Resources folder as `OFL-<family>.txt`.

| Family | Copyright | Source | Files |
|---|---|---|---|
| Aleo | Copyright 2018 The Aleo Project Authors | https://github.com/AlessioLaiso/aleo | `aleo/Aleo-Variable.ttf`, `Aleo-VariableItalic.ttf` |
| Atkinson Hyperlegible Next | Copyright 2020-2024 The Atkinson Hyperlegible Next Project Authors | https://github.com/googlefonts/atkinson-hyperlegible-next | `atkinson/AtkinsonHyperlegibleNext-Variable.ttf`, `-VariableItalic.ttf` |
| Courier Prime | Copyright 2015 The Courier Prime Project Authors | https://github.com/quoteunquoteapps/CourierPrime | `courier-prime/CourierPrime-{Regular,Bold,Italic,BoldItalic}.ttf` |
| Fraunces | Copyright 2018 The Fraunces Project Authors | https://github.com/undercasetype/Fraunces | `fraunces/Fraunces-Variable.woff2`, `Fraunces-VariableItalic.woff2` |
| Inter | Copyright (c) 2016 The Inter Project Authors | https://github.com/rsms/inter | `inter/InterVariable.ttf`, `InterVariable-Italic.ttf` (licence supplied as `LICENSE.txt`, shipped as `OFL.txt`) |
