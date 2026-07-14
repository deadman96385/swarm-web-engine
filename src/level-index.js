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
// "LHC" fan-made security-themed pack shipped in-repo (src/lhc-levels.js), not
// from any original archive: GAME_LEVEL_LHC_[EMH]_####.xml. Its own campaign so
// it lists separately from the base Swarm/Bonus/Original missions.
export const LHC_RE = /(^|\/)GAME_LEVEL_LHC_[EMH]_\d+\.xml$/i;
// Curated 22x24 Swarm XL expansion missions.
export const XL_RE = /^XL\/GAME_LEVEL_XL_[EMH]_\d+\.xml$/i;
// Runtime-generated, versioned Procedural Swarm missions. The source name is a
// complete replay identity: generator version + difficulty + economy + seed.
export const PROC_RE = /^Procedural\/v(\d+)\/GAME_LEVEL_PROC_(?:(XL)_)?([EMH])_(NORMAL|RANDOM)_([0-9A-F]{8})\.xml$/i;
// Original geoDefense fixed-path levels sit at the .ipa bundle root, sharing the
// GAME_LEVEL_[EMH]_#### shape but never under SwarmLevels/ or MainLevels/.
const CLASSIC_TAIL_RE = /GAME_LEVEL_[EMH]_\d+\.xml$/i;
const CLASSIC_EXCLUDE_RE = /\/(SwarmLevels|MainLevels)\//i;

export function classifyName(name) {
  if (BASE_RE.test(name)) return 'base';
  if (LP_RE.test(name)) return 'lp';
  if (LHC_RE.test(name)) return 'lhc';
  if (XL_RE.test(name)) return 'xl';
  if (PROC_RE.test(name)) return 'procedural';
  if (CLASSIC_TAIL_RE.test(name) && !CLASSIC_EXCLUDE_RE.test(name)) return 'classic';
  return null;
}

export function parseProceduralIdentity(name) {
  const match = name.match(PROC_RE);
  if (!match) return null;
  return {
    version: Number(match[1]),
    size: match[2] ? 'xl' : 'standard',
    difficulty: { E: 'Easy', M: 'Medium', H: 'Hard' }[match[3].toUpperCase()],
    economyMode: match[4].toLowerCase(),
    seed: match[5].toUpperCase()
  };
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
  const base = [], lp = [], classic = [], lhc = [], xl = [], procedural = [];
  for (const { sourceName, xml } of entries) {
    switch (classifyName(sourceName)) {
      case 'base': base.push(parseLevel(xml, sourceName)); break;
      case 'lp': lp.push(parseLevel(xml, sourceName, 'Bonus')); break;
      case 'lhc': lhc.push(parseLevel(xml, sourceName, null, 'lhc')); break;
      case 'xl': xl.push(parseLevel(xml, sourceName, null, 'xl')); break;
      case 'procedural': {
        const identity = parseProceduralIdentity(sourceName);
        const level = parseLevel(xml, sourceName, identity.difficulty, 'procedural');
        level.procedural = identity;
        procedural.push(level);
        break;
      }
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
  lhc.sort((a, b) => diffRank(a.difficulty) - diffRank(b.difficulty) || a.id - b.id);
  xl.sort((a, b) => diffRank(a.difficulty) - diffRank(b.difficulty) || a.id - b.id);
  procedural.sort((a, b) => diffRank(a.difficulty) - diffRank(b.difficulty) || a.id - b.id);
  return [...base, ...lp, ...classic, ...lhc, ...xl, ...procedural];
}
