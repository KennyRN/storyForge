/**
 * titleForge engine — Markov name model, ported from nameForge.
 *
 * Verbatim copy of the name half of nameForge's `src/markov.ts` (lines 55–863 at nameForge commit
 * 9bc5c6a, 2026-08-30; same author, MIT): the interpolated variable-order `MarkovModel`, its
 * seeded `mulberry32` RNG, and `extractNamesFromMarkdown` for reading nameForge pack files. The
 * place-name and compound models are not ported. Keep it verbatim so the two copies diff cleanly;
 * titleForge-specific glue lives in `names.ts`.
 *
 * Obsidian-free and import-free, like the rest of `engine/`.
 */
// ---------------------------------------------------------------------------
// Boundary markers. These must never appear inside a real name; `^` and `$`
// are safe for onomastic data.
// ---------------------------------------------------------------------------
const START = "^";
const END = "$";
const KMAX = 3;
const UNIGRAM_KEY = "~";

export interface GenerateOptions {
  /** How many names to return. */
  count: number;
  /**
   * 1..3. Higher = higher-order context dominates, so output hugs the source
   * style more closely. Maps to wbase = [2.5, 4.0, 7.0]. Default 2.
   */
  faithfulness?: number;
  /**
   * 1..5. Widens/narrows the perplexity acceptance window. Higher = fussier
   * (rejects both odd and over-generic names). Default 3.
   */
  strictness?: number;
  /**
   * If true, a generated name may be identical to a source name.
   * Default false — the whole point is usually novel names.
   */
  allowSourceCopies?: boolean;
  /**
   * 0..3. Rejects any generated name within this many edits of a source
   * name, so every result is guaranteed at least `novelty + 1` edits away.
   * Default 0 — close-to-original allowed; only exact copies are rejected
   * (and even those pass if `allowSourceCopies` is true). Set 1 to reject
   * one-letter-off names like "Aelfrid" (vs "Aelfric"); 2–3 push further
   * still. Values above 0 always reject exact copies, regardless of
   * `allowSourceCopies`.
   */
  novelty?: number;
  /**
   * RNG seed (any finite number). Same seed + same source list + same options
   * = identical output, so results are reproducible. Omit for a random seed —
   * the seed actually used is always returned by `generateDetailed`.
   */
  seed?: number;
}

export interface GenerateResult {
  names: string[];
  /**
   * The seed that produced `names`.
   *
   * UI NOTE (for whoever wires this into the plugin): render this in a
   * read-only "Seed" display box directly BENEATH the output box, with a
   * copy button, and provide an optional seed input so the user can paste a
   * seed back in to reproduce a previous batch. Pass that input through as
   * `options.seed`.
   */
  seed: number;
}

/** A blended next-character distribution, cached per context. */
interface Dist {
  chars: string[]; // candidate characters (may include END)
  cum: Float64Array; // cumulative blended scores, same length as chars
  tot: number; // total blended score
  endScore: number; // blended score of END (0 if absent)
  endProb: number; // endScore / tot
}

/**
 * A trained name model. Built with `MarkovModel.build(names)` and queried with
 * `generate(...)`. The tables live in memory for the session; rebuild whenever
 * the source list changes (it's cheap).
 */
export class MarkovModel {
  /** tables[k] : Map<context, Map<nextChar, count>>. k = 0 is the unigram. */
  private readonly tables: Array<Map<string, Map<string, number>>>;
  /** Lowercased source names, for copy rejection. */
  private readonly sourceSet: Set<string>;
  /** Source names bucketed by length, for edit-distance (novelty) checks. */
  private readonly sourceByLength: Map<number, string[]>;
  readonly minLength: number;
  readonly maxLength: number;
  /** First characters of source names — phonotactic gate. */
  private readonly initials: Set<string>;
  /** First-two-character sequences of source names — phonotactic gate. */
  private readonly startBigrams: Set<string>;
  /** Character bigrams seen anywhere inside source names — phonotactic gate. */
  private readonly bigrams: Set<string>;

  /** Blended-distribution cache. Valid only for `cacheWbase`. */
  private distCache = new Map<string, Dist | null>();
  private cacheWbase = Number.NaN;

  private constructor(
    tables: Array<Map<string, Map<string, number>>>,
    sourceSet: Set<string>,
    minLength: number,
    maxLength: number,
    initials: Set<string>,
    startBigrams: Set<string>,
    bigrams: Set<string>
  ) {
    this.tables = tables;
    this.sourceSet = sourceSet;
    this.minLength = minLength;
    this.maxLength = maxLength;
    this.sourceByLength = bucketByLength(sourceSet);
    this.initials = initials;
    this.startBigrams = startBigrams;
    this.bigrams = bigrams;
  }

  /**
   * Build the interpolated model from a list of names. Names are lowercased;
   * casing is reapplied (first letter only) at generation time.
   */
  static build(names: string[]): MarkovModel {
    const tables: Array<Map<string, Map<string, number>>> = [
      new Map<string, Map<string, number>>(),
      new Map<string, Map<string, number>>(),
      new Map<string, Map<string, number>>(),
      new Map<string, Map<string, number>>(),
    ];

    const lowerNames = names
      .map((n) => n.trim().toLowerCase())
      .filter((n) => n.length > 0);

    const sourceSet = new Set(lowerNames);

    let minL = Number.POSITIVE_INFINITY;
    let maxL = 0;

    const initials = new Set<string>();
    const startBigrams = new Set<string>();
    const bigrams = new Set<string>();

    for (const name of lowerNames) {
      const chars = Array.from(name); // code-point safe
      minL = Math.min(minL, chars.length);
      maxL = Math.max(maxL, chars.length);

      initials.add(chars[0]);
      if (chars.length >= 2) startBigrams.add(chars[0] + chars[1]);
      for (let i = 1; i < chars.length; i++) {
        bigrams.add(chars[i - 1] + chars[i]);
      }

      // Bracketed sequence: ^ + name + $  (as an array of single chars).
      const s = [START, ...chars, END];

      // For each position i (skipping the leading ^), record the transition
      // context -> s[i] for every order k = 0..KMAX that fits.
      for (let i = 1; i < s.length; i++) {
        const ch = s[i];
        for (let k = 0; k <= KMAX; k++) {
          if (i - k < 0) continue;
          const ctx = k === 0 ? UNIGRAM_KEY : s.slice(i - k, i).join("");
          let table = tables[k].get(ctx);
          if (!table) {
            table = new Map();
            tables[k].set(ctx, table);
          }
          table.set(ch, (table.get(ch) ?? 0) + 1);
        }
      }
    }

    if (!isFinite(minL)) minL = 3; // empty input — harmless defaults
    const minLength = Math.max(2, minL);
    const maxLength = Math.min(15, maxL + 1);
    return new MarkovModel(
      tables,
      sourceSet,
      minLength,
      maxLength,
      initials,
      startBigrams,
      bigrams
    );
  }

  /**
   * Generate up to `count` unique names. Returns fewer than requested only if
   * the model is too small/strict to produce them within the attempt budget.
   * Convenience wrapper — use `generateDetailed` when the UI needs the seed.
   */
  generate(options: GenerateOptions): string[] {
    return this.generateDetailed(options).names;
  }

  /**
   * As `generate`, but also returns the RNG seed that was used, so the UI can
   * display it (see the UI NOTE on `GenerateResult`) and the batch can be
   * reproduced later by passing the same seed back in.
   */
  generateDetailed(options: GenerateOptions): GenerateResult {
    const count = Math.max(0, Math.floor(options.count));
    const faithfulness = clampInt(options.faithfulness ?? 2, 1, 3);
    const strictness = clampInt(options.strictness ?? 3, 1, 5);
    const allowCopies = options.allowSourceCopies ?? false;
    const novelty = clampInt(options.novelty ?? 0, 0, 3);
    const seed =
      options.seed !== undefined && Number.isFinite(options.seed)
        ? options.seed >>> 0
        : (Math.random() * 0xffffffff) >>> 0;
    const rng = mulberry32(seed);

    const wbase = [2.5, 4.0, 7.0][faithfulness - 1];
    const [minP, maxP] = strictnessBounds(strictness);
    this.ensureCache(wbase);

    const result: string[] = [];
    const seen = new Set<string>();
    let tries = 0;
    const maxTries = Math.max(1000, count * 300);

    while (result.length < count && tries < maxTries) {
      tries++;
      const w = this.trySampleWord(rng, wbase, minP, maxP);
      if (w === null) continue;
      if (!this.validPhonotactics(w)) continue;

      if (!allowCopies && this.sourceSet.has(w)) continue;
      if (seen.has(w)) continue;

      // Novelty gate (last, as it's the dearest check): reject anything
      // within `novelty` edits of a source name.
      if (
        novelty > 0 &&
        tooCloseToAny(w, Array.from(w).length, this.sourceByLength, novelty)
      )
        continue;

      seen.add(w);
      result.push(capitaliseFirst(w));
    }

    return { names: result, seed };
  }

  /**
   * @internal Reset the blended-distribution cache if `wbase` changed.
   * Must be called before a run of `trySampleWord` calls.
   */
  ensureCache(wbase: number): void {
    if (wbase !== this.cacheWbase) {
      this.distCache.clear();
      this.cacheWbase = wbase;
    }
  }

  /**
   * @internal One sampling attempt. Returns a lowercase word that ended
   * naturally and passed the length / repeat / perplexity gates, or null.
   * Copy-rejection, batch dedupe, novelty, and capitalisation are the
   * caller's job. Call `ensureCache(wbase)` before a run of attempts.
   */
  trySampleWord(
    rng: () => number,
    wbase: number,
    minP: number,
    maxP: number
  ): string | null {
    const name: string[] = [START];
    let logp = 0;
    let ended = false;

    while (name.length - 1 < this.maxLength) {
      const dist = this.getDist(name, wbase);
      if (!dist) break;

      const len = name.length - 1;
      const mustContinue = len < this.minLength;

      if (mustContinue && dist.endScore >= dist.tot) break; // only END available

      const [ch, p] = sampleDist(dist, mustContinue, rng);

      if (ch === END) {
        ended = true; // natural, model-chosen ending
        break;
      }
      name.push(ch);
      logp += Math.log(Math.max(p, 0.0001));
    }

    // If we ran out of room, still allow a graceful stop when the model
    // says END is possible right here; otherwise the candidate is a
    // truncation and gets rejected.
    if (!ended && name.length - 1 >= this.maxLength) {
      const dist = this.getDist(name, wbase);
      if (dist && dist.endScore > 0) ended = true;
    }
    if (!ended) return null;

    const w = name.slice(1).join("");
    const wLen = name.length - 1;

    if (wLen < this.minLength) return null;
    if (hasRepeat(w)) return null;

    const perp = Math.exp(-logp / Math.max(1, wLen));
    if (!(perp <= maxP && perp >= minP)) return null;

    return w;
  }

  /**
   * Corpus phonotactics for a whole generated word: valid initial letter,
   * valid initial digraph (guards against order-1 evidence overriding the
   * order-2 start context, e.g. "^l" + "l->f" producing "Lfstan"), and every
   * adjacent character pair attested somewhere in a source name. Mirrors
   * `PlaceNameModel.validBigrams` but additionally gates the start bigram,
   * since whole-word generation (unlike stem generation) needs the start of
   * the word to be corpus-authentic too.
   */
  private validPhonotactics(w: string): boolean {
    const chars = Array.from(w);
    if (chars.length === 0 || !this.initials.has(chars[0])) return false;
    if (chars.length >= 2 && !this.startBigrams.has(chars[0] + chars[1]))
      return false;
    for (let i = 1; i < chars.length; i++) {
      if (!this.bigrams.has(chars[i - 1] + chars[i])) return false;
    }
    return true;
  }

  /**
   * Blended next-character distribution for the current context, cached per
   * unique trailing-KMAX-characters key. Each order k contributes its
   * normalised counts weighted by wbase^k × a Witten–Bell confidence factor
   * tot/(tot + distinct), so sparse high-order evidence no longer swamps the
   * blend (the main cause of verbatim source copies).
   */
  private getDist(context: string[], wbase: number): Dist | null {
    const key =
      context.length <= KMAX
        ? context.join("")
        : context.slice(-KMAX).join("");

    const cached = this.distCache.get(key);
    if (cached !== undefined) return cached;

    const scores = new Map<string, number>();
    for (let k = 0; k <= KMAX; k++) {
      if (k > context.length) break;
      const sub = k > 0 ? context.slice(-k).join("") : UNIGRAM_KEY;
      const d = this.tables[k].get(sub);
      if (!d) continue;

      let tot = 0;
      for (const v of d.values()) tot += v;
      if (tot === 0) continue;

      const confidence = tot / (tot + d.size); // Witten–Bell style
      const w = Math.pow(wbase, k) * confidence;
      for (const [ch, cnt] of d) {
        scores.set(ch, (scores.get(ch) ?? 0) + (w * cnt) / tot);
      }
    }

    let dist: Dist | null = null;
    if (scores.size > 0) {
      const chars = new Array<string>(scores.size);
      const cum = new Float64Array(scores.size);
      let running = 0;
      let endScore = 0;
      let i = 0;
      for (const [ch, s] of scores) {
        running += s;
        chars[i] = ch;
        cum[i] = running;
        if (ch === END) endScore = s;
        i++;
      }
      dist = {
        chars,
        cum,
        tot: running,
        endScore,
        endProb: endScore / running,
      };
    }

    this.distCache.set(key, dist);
    return dist;
  }
}

// ---------------------------------------------------------------------------
// Generation helpers
// ---------------------------------------------------------------------------

/**
 * Weighted random pick over a cached distribution. When `excludeEnd` is set
 * the end marker's mass is skipped without rebuilding the distribution.
 * Returns the chosen character and its normalised probability within the
 * (possibly END-excluded) distribution, for the perplexity accumulation.
 */
function sampleDist(
  dist: Dist,
  excludeEnd: boolean,
  rng: () => number
): [string, number] {
  const { chars, cum, tot, endScore } = dist;
  const effTot = excludeEnd ? tot - endScore : tot;
  if (effTot <= 0) return [END, 0.0001];

  let r = rng() * effTot;
  let prev = 0;
  for (let i = 0; i < chars.length; i++) {
    const score = cum[i] - prev;
    prev = cum[i];
    if (excludeEnd && chars[i] === END) continue;
    r -= score;
    if (r <= 0) return [chars[i], score / effTot];
  }
  // Floating-point fallthrough: return the last eligible entry.
  for (let i = chars.length - 1; i >= 0; i--) {
    if (excludeEnd && chars[i] === END) continue;
    const score = cum[i] - (i > 0 ? cum[i - 1] : 0);
    return [chars[i], score / effTot];
  }
  return [END, 0.0001];
}

/**
 * Mulberry32 — small, fast, decent-quality 32-bit PRNG. Deterministic for a
 * given seed, which is what makes reproducible batches possible. Exported so
 * callers that build their own composite generators (e.g. compound names,
 * which seed several sub-generators from one master seed) can reuse it
 * instead of hand-rolling another RNG.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Levenshtein distance with an early-exit band: returns true iff
 * dist(a, b) <= maxD. Code-point safe; O(len(a) × len(b)) worst case but
 * bails out as soon as the whole row exceeds maxD.
 */
function withinEditDistance(a: string, b: string, maxD: number): boolean {
  const A = Array.from(a);
  const B = Array.from(b);
  if (Math.abs(A.length - B.length) > maxD) return false;

  let prev = new Array<number>(B.length + 1);
  let cur = new Array<number>(B.length + 1);
  for (let j = 0; j <= B.length; j++) prev[j] = j;

  for (let i = 1; i <= A.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= B.length; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > maxD) return false;
    [prev, cur] = [cur, prev];
  }
  return prev[B.length] <= maxD;
}

/**
 * True if `w` (length `wLen`) is within `maxD` edits of any name in the
 * length-bucketed set. Shared by MarkovModel and PlaceNameModel.
 */
function tooCloseToAny(
  w: string,
  wLen: number,
  buckets: Map<number, string[]>,
  maxD: number
): boolean {
  for (let len = wLen - maxD; len <= wLen + maxD; len++) {
    const bucket = buckets.get(len);
    if (!bucket) continue;
    for (const s of bucket) {
      if (withinEditDistance(w, s, maxD)) return true;
    }
  }
  return false;
}

/** Bucket a set of lowercase names by code-point length. */
function bucketByLength(names: Iterable<string>): Map<number, string[]> {
  const buckets = new Map<number, string[]>();
  for (const s of names) {
    const len = Array.from(s).length;
    let bucket = buckets.get(len);
    if (!bucket) {
      bucket = [];
      buckets.set(len, bucket);
    }
    bucket.push(s);
  }
  return buckets;
}

/**
 * Reject names containing an immediately repeated block of 2 or 3 characters
 * (e.g. "anan", "abcabc").
 */
function hasRepeat(w: string): boolean {
  const chars = Array.from(w);
  const n = chars.length;
  for (let L = 2; L <= 3; L++) {
    if (n < 2 * L) continue;
    for (let i = 0; i <= n - 2 * L; i++) {
      let equal = true;
      for (let j = 0; j < L; j++) {
        if (chars[i + j] !== chars[i + L + j]) {
          equal = false;
          break;
        }
      }
      if (equal) return true;
    }
  }
  return false;
}

/** Per-character perplexity window keyed by strictness (1..5). */
function strictnessBounds(s: number): [number, number] {
  const minP = [1.0, 1.15, 1.3, 1.45, 1.6][s - 1];
  const maxP = [9.0, 7.5, 6.5, 5.5, 4.8][s - 1];
  return [minP, maxP];
}

function clampInt(x: number, lo: number, hi: number): number {
  const r = Math.round(x);
  return Math.max(lo, Math.min(hi, r));
}

export function capitaliseFirst(w: string): string {
  const arr = Array.from(w);
  if (arr.length === 0) return w;
  return arr[0].toUpperCase() + arr.slice(1).join("");
}

// ===========================================================================
// Markdown — names
// ===========================================================================
//
// Reads a clean list of source names out of markdown content. Handles the
// layouts you'd actually keep name lists in:
//
//   * one name per line
//   * bullet / numbered / checklist items:  - Name   * Name   1. Name   - [ ] Name
//   * comma-separated lists on a line (Oxford and non-Oxford: "A, B, and C" / "A, B and C")
//   * space-separated lists of 3+ names on a line (Harold Heafoc Heahbeorth …)
//   * Obsidian wikilinks and markdown links:  [[Aelfric]]  [[target|Display]]  [text](url)
//
// It strips: YAML frontmatter, fenced code blocks, headings, horizontal rules,
// blockquote/list markers, emphasis/inline-code markup, Obsidian %%comments%%,
// and trailing list conjunctions ("and"/"or"/"&"/"etc"). Prose paragraphs with
// commas will be split on those commas — keep source files as name lists, not
// running prose. One or two words on a line stay as a single name (Mary Jane,
// Great Stowe); three or more space-separated tokens are treated as a list.

const NOISE = new Set([
  "and",
  "or",
  "nor",
  "&",
  "+",
  "etc",
  "etcetera",
  "&c",
]);
const JOINERS = [" and ", " or ", " nor ", " & ", " + "];
const LEADERS = ["and ", "or ", "nor ", "& ", "+ "];

/**
 * Extract names from one markdown string, or from several (their results are
 * concatenated and de-duplicated case-insensitively).
 */
export function extractNamesFromMarkdown(markdown: string | string[]): string[] {
  const sources = Array.isArray(markdown) ? markdown : [markdown];
  const all: string[] = [];
  for (const src of sources) all.push(...extractFromSingle(src));
  return dedupe(all);
}

/** Convenience: extract + build in one call. */
export function buildModelFromMarkdown(
  markdown: string | string[]
): MarkovModel {
  return MarkovModel.build(extractNamesFromMarkdown(markdown));
}

function extractFromSingle(markdown: string): string[] {
  const withoutFrontmatter = stripFrontmatter(markdown);
  const withoutCode = stripFencedCode(withoutFrontmatter);
  const lines = withoutCode.split(/\r?\n/);

  const cleanedLines: string[] = [];
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (line === "") continue;

    if (/^#{1,6}\s/.test(line)) continue; // heading
    if (/^([-*_])(\s*\1){2,}$/.test(line)) continue; // horizontal rule
    if (/^[\s|:-]+$/.test(line) && line.includes("-")) continue; // table separator

    line = line.replace(/^>+\s?/, ""); // blockquote
    line = line.replace(/^(?:[-*+]|\d+[.)])\s+/, ""); // list bullet / number
    line = line.replace(/^\[[ xX]\]\s+/, ""); // checkbox
    line = stripInlineMarkup(line);
    line = line.trim();

    if (line !== "") cleanedLines.push(line);
  }

  return parseNameTokens(cleanedLines.join("\n"));
}

function stripFrontmatter(md: string): string {
  const m = md.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? md.slice(m[0].length) : md;
}

function stripFencedCode(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "");
}

function stripInlineMarkup(s: string): string {
  let t = s;
  t = t.replace(/%%[\s\S]*?%%/g, ""); // Obsidian comments
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ""); // images
  // Wikilinks: [[target|display]] -> display, [[target]] -> target
  t = t.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_m, target: string, display?: string) => (display ?? target)
  );
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // [text](url) -> text
  t = t.replace(/`([^`]*)`/g, "$1"); // inline code
  t = t.replace(/(\*\*|__|\*|_|~~)/g, ""); // bold / italic / strike
  return t;
}

/**
 * Split a cleaned block into individual names. Commas and newlines always
 * separate; a trailing non-Oxford conjunction ("Bob and Carol") is split;
 * a run of 3+ space-separated tokens on one line is split (short quoted
 * phrases stay together); noise tokens ("and", "&", "etc") are dropped.
 */
function parseNameTokens(text: string): string[] {
  const tokens = text
    .split(/[\n,;]/)
    .flatMap((t) => splitOnJoiners(t))
    .flatMap((t) => splitSpaceSeparatedList(t))
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const names: string[] = [];
  for (const token of tokens) {
    const cleaned = cleanToken(stripLeadingConjunction(token));
    if (cleaned === "" || isNoise(cleaned)) continue;
    names.push(cleaned);
  }
  return dedupe(names);
}

/**
 * A line (or comma-chunk) with 3+ space-separated tokens is a pasted name
 * dump, not one multi-word name. One or two words stay intact so "Mary Jane"
 * and "Great Stowe" on their own line are preserved.
 *
 * If quote-aware splitting still yields one blob, fall back to a raw
 * whitespace split so a dump wrapped in quotes (or with a stray apostrophe)
 * is not kept as a single name.
 */
function splitSpaceSeparatedList(token: string): string[] {
  const parts = splitOnUnquotedWhitespace(token);
  if (parts.length >= 3) return parts;

  const loose = unwrapOuterQuotes(token.trim()).split(/\s+/).filter((p) => p.length > 0);
  if (loose.length >= 3) return loose;
  return [token];
}

function unwrapOuterQuotes(s: string): string {
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["\u201C", "\u201D"],
    ["'", "'"],
    ["\u2018", "\u2019"],
  ];
  for (const [open, close] of pairs) {
    if (s.length >= 2 && s.startsWith(open) && s.endsWith(close)) {
      return s.slice(open.length, s.length - close.length).trim();
    }
  }
  return s;
}

/**
 * Split on whitespace, but keep short "quoted phrases" as a single token.
 * Apostrophes are not quote openers (O'Donovan, stray ' from copy-paste).
 */
function splitOnUnquotedWhitespace(token: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;

  for (const char of token) {
    if (quote) {
      current += char;
      if (char === matchingQuote(quote)) quote = null;
      continue;
    }
    if (char === '"' || char === "\u201C") {
      quote = char;
      current += char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function matchingQuote(open: string): string {
  if (open === "\u201C") return "\u201D";
  if (open === "\u2018") return "\u2019";
  return open;
}

/** Split "Cutha and Dunstan" → ["Cutha", "Dunstan"] wherever a joiner occurs. */
function splitOnJoiners(token: string): string[] {
  let parts = [token];
  for (const joiner of JOINERS) {
    const next: string[] = [];
    for (const part of parts) {
      let rest = part;
      let idx: number;
      while ((idx = rest.toLowerCase().indexOf(joiner)) >= 0) {
        next.push(rest.slice(0, idx));
        rest = rest.slice(idx + joiner.length);
      }
      next.push(rest);
    }
    parts = next;
  }
  return parts;
}

function stripLeadingConjunction(token: string): string {
  const lower = token.toLowerCase();
  for (const lead of LEADERS) {
    if (lower.startsWith(lead)) return token.slice(lead.length).trim();
  }
  return token;
}

/**
 * Trim whitespace, trailing list punctuation, and matched surrounding quotes.
 * Apostrophes inside a name (O'Donovan) are preserved.
 */
function cleanToken(s: string): string {
  let t = s.trim();
  while (t.length > 0 && (t.endsWith(";") || t.endsWith(","))) {
    t = t.slice(0, -1);
  }
  t = t.trim();

  const quotePairs: Array<[string, string]> = [
    ['"', '"'],
    ["“", "”"],
    ["'", "'"],
  ];
  for (const [open, close] of quotePairs) {
    if (t.length >= 2 && t.startsWith(open) && t.endsWith(close)) {
      t = t.slice(open.length, t.length - close.length);
      break;
    }
  }
  return t.trim();
}

function isNoise(s: string): boolean {
  const t = s.toLowerCase().replace(/^[.\s…]+|[.\s…]+$/g, "");
  return t === "" || t === "..." || NOISE.has(t);
}

function dedupe(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const key = n.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(n);
    }
  }
  return out;
}
