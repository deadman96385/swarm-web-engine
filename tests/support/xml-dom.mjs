// Minimal XML -> DOM shim so Node tests can exercise parseLevel (which uses the
// browser's DOMParser). It supports only the selector surface parseLevel needs:
// querySelector/All for a single tag name and the `A > B` child combinator, plus
// getAttribute. Attribute values are entity-decoded; text nodes are ignored
// (parseLevel reads attributes only). Not a general-purpose XML parser.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === '#') { const code = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(code) ? String.fromCodePoint(code) : m; }
    return ENTITIES[e] ?? m;
  });
}

class El {
  constructor(tag) { this.tagName = tag; this.attributes = {}; this.children = []; this.parent = null; }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  _descendants(tag, acc) { for (const c of this.children) { if (c.tagName === tag) acc.push(c); c._descendants(tag, acc); } return acc; }
  _selfAndDescendants(tag) { const acc = []; if (this.tagName === tag) acc.push(this); return this._descendants(tag, acc); }
  querySelectorAll(sel) {
    const parts = sel.split('>').map(s => s.trim());
    if (parts.length === 2) { const [a, b] = parts, out = []; for (const anc of this._selfAndDescendants(a)) for (const c of anc.children) if (c.tagName === b) out.push(c); return out; }
    return this._descendants(sel.trim(), []);
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}

class Doc {
  constructor(root) { this.root = root; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  querySelectorAll(sel) {
    if (!this.root) return [];
    const parts = sel.split('>').map(s => s.trim());
    if (parts.length === 2) { const [a, b] = parts, out = []; for (const anc of this.root._selfAndDescendants(a)) for (const c of anc.children) if (c.tagName === b) out.push(c); return out; }
    return this.root._selfAndDescendants(sel.trim());
  }
}

function parseXML(xml) {
  xml = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const tagRe = /<(\/)?([a-zA-Z_][\w.-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/)?>/g;
  const attrRe = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m, root = null, current = null;
  while ((m = tagRe.exec(xml))) {
    const [, closing, tag, attrsStr, selfClose] = m;
    if (closing) { current = current?.parent ?? null; continue; }
    const el = new El(tag); el.parent = current;
    let a; attrRe.lastIndex = 0;
    while ((a = attrRe.exec(attrsStr))) el.attributes[a[1]] = decode(a[2] ?? a[3] ?? '');
    if (current) current.children.push(el); else root = el;
    if (!selfClose) current = el;
  }
  return new Doc(root);
}

export function installDomParser() {
  if (typeof globalThis.DOMParser !== 'undefined') return;
  globalThis.DOMParser = class { parseFromString(str) { return parseXML(str); } };
}
