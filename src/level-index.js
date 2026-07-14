// Shared level discovery + classification.
//
// This module is deliberately environment-agnostic: it imports nothing
// browser-only or Node-only, and `parseLevel` is injected by the caller. That
// lets both the browser boot (src/main.js) and the Node extractor
// (scripts/extract-data.mjs) classify and order levels through one source of
// truth. The regexes and sort rules are lifted verbatim from the original
// inline `#archiveInput` discovery so bundled data and archive imports produce
// identical `levels` arrays.

// Base Swarm missions live only in the .xap under Content/MainLevels.
export const BASE_RE = /^Content\/MainLevels\/GAME_LEVEL_[EMH]_\d+\.xml$/i;
// iOS Level Pack 1 bonus missions (either archive), e.g. GAME_LEVEL_LP1_M_0001.xml.
export const LP_RE = /(^|\/)GAME_LEVEL_LP\d+_[EMH]_\d+\.xml$/i;
// Original geoDefense fixed-path levels sit at the .ipa bundle root, sharing the
// GAME_LEVEL_[EMH]_#### shape but never under SwarmLevels/ or MainLevels/.
const CLASSIC_TAIL_RE = /GAME_LEVEL_[EMH]_\d+\.xml$/i;
const CLASSIC_EXCLUDE_RE = /\/(SwarmLevels|MainLevels)\//i;

export function classifyName(name) {
  if (BASE_RE.test(name)) return 'base';
  if (LP_RE.test(name)) return 'lp';
  if (CLASSIC_TAIL_RE.test(name) && !CLASSIC_EXCLUDE_RE.test(name)) return 'classic';
  return null;
}

export function lpRank(name) {
  const m = name.match(/_LP\d+_([EMH])_(\d+)/i);
  return m ? { E: 0, M: 1, H: 2 }[m[1].toUpperCase()] * 1000 + Number(m[2]) : 9999;
}

export function diffRank(difficulty) {
  return { Easy: 0, Medium: 1, Hard: 2 }[difficulty] ?? 9;
}

// entries: [{ sourceName, xml }].
// parseLevel: (xml, sourceName, difficulty?, campaign?) => level object.
// Returns the combined, per-bucket-sorted levels array: [...base, ...lp, ...classic].
export function buildLevels(entries, parseLevel) {
  const base = [], lp = [], classic = [];
  for (const { sourceName, xml } of entries) {
    switch (classifyName(sourceName)) {
      case 'base': base.push(parseLevel(xml, sourceName)); break;
      case 'lp': lp.push(parseLevel(xml, sourceName, 'Bonus')); break;
      case 'classic': {
        const level = parseLevel(xml, sourceName, null, 'classic');
        if (level.pathMode) classic.push(level); // fixed-path levels only
        break;
      }
    }
  }
  base.sort((a, b) => a.id - b.id);
  lp.sort((a, b) => lpRank(a.sourceName) - lpRank(b.sourceName));
  classic.sort((a, b) => diffRank(a.difficulty) - diffRank(b.difficulty) || a.id - b.id);
  return [...base, ...lp, ...classic];
}
