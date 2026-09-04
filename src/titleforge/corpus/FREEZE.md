# titleForge series-name corpus — FREEZE CERTIFICATE

- **Version:** 1.0.0
- **Frozen:** 2026-09-02
- **CORE records:** 303
- **SHA-256 (corpus.core.json):** `4025e68d845784bcfbbffbcf8acb7031539e44e638229e6f9ec4f95bf92962c1`
- **Result:** FROZEN — all gates passed

## Freeze gates

| gate | check | result | detail |
|---|---|---|---|
| FG1 | Population sufficiency | PASS | CORE 303 >= floor 300 |
| FG2 | Validation integrity | PASS | 0 validation problem(s) |
| FG3 | Dedup resolved | PASS | 1 cluster(s); 0 unacknowledged |
| FG4 | Registers complete | PASS | rejected 35 (missing reason 0); quarantine 4 (missing note 0) |
| FG5 | Derivation integrity (FR-27) | PASS | bad sf-source 0; sub-multi-word CORE 0 |
| FG6 | Materiality / stability | PASS | top family stable=true; article THE all/no-bloc/C3 = 52.8/54.0/51.4 (<=10pp) |

Materiality rule: a headline finding must not shift by more than 10
percentage points, nor change rank, under the bloc-removed or C3-only cut.

## Registers (frozen)

- Duplicate clusters: 1 (acknowledged: belisarius)
- Quarantine: 4 · Rejection: 35. See REGISTERS.md.

## Limitations (carried into any use of these findings)

1. **Deliberate bloc bias** — Baen + WMG are intentionally present (9.6% of CORE),
   tagged and subtractable; the frozen sensitivity cut shows they do not move the
   headline shape.
2. **Indie is a representative sample, not exhaustive** — the KDP self-published long
   tail is under-sampled relative to its real size; treat indie proportions as a floor.
3. **Conservative confidence** — C2 is used wherever a canonical umbrella name is
   contested; the C3-only cut is provided for readers who want the strict subset.
4. **Anglophone/Western scope only** — translated and non-Western series are excluded
   by rule (recorded as SCOPE rejections); web-fiction/LitRPG naming is out of scope.
5. **Semantic axis = naming_focus** — no finer semantic-domain tagging was built.

## Governance

Trimmed by project decision: version + three registers + this limitations note.
No reopening classes, per-judgement decision log, or inter-rater ceremony. To revise,
edit records.mjs and re-run `node freeze.mjs`; a changed SHA-256 denotes a new version.
