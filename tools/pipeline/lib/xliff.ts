// XLIFF 1.2 in the dialect bellingua reads and writes (github.com/Thrapis/bellingua,
// internal/formats/xliff): one <file> per document, codes as <ph id="N">native</ph>
// numbered 1..n per unit in source order, Go encoding/xml text escaping.
// On read, target codes are resolved by id back to the exact source markup; a target
// that references an unknown id, repeats one or leaves one out is dropped and reported.
import { type Piece } from "./placeholders.ts";

export interface XliffUnit {
  id: string;
  note?: string;
  source: Piece[];
  target?: Piece[]; // undefined = untranslated
  state?: string; // XLIFF target state: needs-review-translation | translated | final
}

export interface XliffFile {
  original: string;
  sourceLang: string;
  targetLang: string;
  units: XliffUnit[];
}

export interface Problem {
  id: string;
  reason: string;
}

// --- writing -----------------------------------------------------------------

export function writeXliff(f: XliffFile): string {
  const out: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>\n`,
    `<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">\n`,
    `  <file original="${esc(f.original)}" source-language="${esc(f.sourceLang)}" target-language="${esc(f.targetLang)}" datatype="plaintext">\n`,
    `    <body>\n`,
  ];
  for (const u of f.units) {
    const srcIds = codeIds(u.source);
    out.push(`      <trans-unit id="${esc(u.id)}" xml:space="preserve">\n`);
    out.push(`        <source>${segment(u.source, srcIds)}</source>\n`);
    if (u.target) {
      const tgtIds = matchCodes(u.source, srcIds, u.target);
      if (!tgtIds) throw new Error(`Unit ${u.id}: target codes do not match source codes`);
      const open = u.state ? `<target state="${esc(u.state)}">` : "<target>";
      out.push(`        ${open}${segment(u.target, tgtIds)}</target>\n`);
    }
    if (u.note) out.push(`        <note>${esc(u.note)}</note>\n`);
    out.push(`      </trans-unit>\n`);
  }
  out.push(`    </body>\n  </file>\n</xliff>\n`);
  return out.join("");
}

function codeIds(ps: Piece[]): number[] {
  let n = 0;
  return ps.map((p) => (p.code ? ++n : 0));
}

function matchCodes(src: Piece[], srcIds: number[], tgt: Piece[]): number[] | undefined {
  const used = new Array<boolean>(src.length).fill(false);
  const ids: number[] = [];
  for (const p of tgt) {
    if (!p.code) {
      ids.push(0);
      continue;
    }
    const j = src.findIndex((s, k) => s.code && !used[k] && s.text === p.text);
    if (j < 0) return undefined;
    used[j] = true;
    ids.push(srcIds[j]!);
  }
  return ids;
}

function segment(ps: Piece[], ids: number[]): string {
  return ps.map((p, i) => (p.code ? `<ph id="${ids[i]}">${esc(p.text)}</ph>` : esc(p.text))).join("");
}

// Mirrors Go's xml.EscapeText, including replacing characters XML cannot hold with U+FFFD.
const ESCAPES: Record<string, string> = {
  '"': "&#34;", "'": "&#39;", "&": "&amp;", "<": "&lt;", ">": "&gt;",
  "\t": "&#x9;", "\n": "&#xA;", "\r": "&#xD;",
};

function esc(s: string): string {
  return s.replace(
    /["'&<>\t\n\r]|[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    (c) => ESCAPES[c] ?? "�",
  );
}

// --- reading -----------------------------------------------------------------

interface El {
  name: string;
  attrs: Record<string, string>;
  children: (El | string)[];
}

export function readXliff(xml: string): { file: XliffFile; problems: Problem[] } {
  const root = parseXml(xml);
  const fileEl = find(root, "file");
  if (!fileEl) throw new Error("XLIFF: no <file> element");
  const file: XliffFile = {
    original: fileEl.attrs["original"] ?? "",
    sourceLang: fileEl.attrs["source-language"] ?? "",
    targetLang: fileEl.attrs["target-language"] ?? "",
    units: [],
  };
  const problems: Problem[] = [];
  for (const tu of findAll(fileEl, "trans-unit")) {
    const id = tu.attrs["id"] ?? "";
    const srcEl = child(tu, "source");
    if (!srcEl) throw new Error(`XLIFF: unit ${id} has no <source>`);
    const src = readSegment(srcEl);
    const unit: XliffUnit = { id, source: src.pieces };
    const tgtEl = child(tu, "target");
    if (tgtEl) {
      const state = tgtEl.attrs["state"];
      if (state) unit.state = state;
      const tgt = readSegment(tgtEl);
      const reason = resolveCodes(tgt, src);
      if (reason) problems.push({ id, reason });
      else unit.target = tgt.pieces;
    }
    const noteEl = child(tu, "note");
    if (noteEl) unit.note = textOf(noteEl);
    file.units.push(unit);
  }
  return { file, problems };
}

interface Segment {
  pieces: Piece[];
  codes: { piece: number; id: string }[];
}

function readSegment(el: El): Segment {
  const pieces: Piece[] = [];
  const codes: Segment["codes"] = [];
  for (const c of el.children) {
    if (typeof c === "string") {
      const last = pieces[pieces.length - 1];
      if (last && !last.code) last.text += c;
      else pieces.push({ text: c });
    } else {
      codes.push({ piece: pieces.length, id: c.attrs["id"] ?? "" });
      pieces.push({ text: textOf(c), code: true });
    }
  }
  return { pieces, codes };
}

function resolveCodes(tgt: Segment, src: Segment): string | undefined {
  const native = new Map(src.codes.map((c) => [c.id, src.pieces[c.piece]!.text]));
  const seen = new Set<string>();
  for (const c of tgt.codes) {
    const text = native.get(c.id);
    if (text === undefined) return `unknown tag id "${c.id}"`;
    if (seen.has(c.id)) return `tag id "${c.id}" used twice`;
    seen.add(c.id);
    tgt.pieces[c.piece]!.text = text;
  }
  if (seen.size !== native.size) {
    const missing = [...native.keys()].filter((id) => !seen.has(id));
    return `missing tag ids ${missing.sort((a, b) => Number(a) - Number(b)).join(",")}`;
  }
  return undefined;
}

const child = (el: El, name: string) => el.children.find((c): c is El => typeof c !== "string" && c.name === name);
const textOf = (el: El): string => el.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");

function find(el: El, name: string): El | undefined {
  if (el.name === name) return el;
  for (const c of el.children) {
    if (typeof c === "string") continue;
    const hit = find(c, name);
    if (hit) return hit;
  }
  return undefined;
}

function findAll(el: El, name: string, out: El[] = []): El[] {
  for (const c of el.children) {
    if (typeof c === "string") continue;
    if (c.name === name) out.push(c);
    else findAll(c, name, out);
  }
  return out;
}

// Minimal well-formedness-checking XML parser: elements, attributes, text,
// entities, CDATA; skips the prolog, comments, PIs and DOCTYPE.
function parseXml(xml: string): El {
  const root: El = { name: "#document", attrs: {}, children: [] };
  const stack: El[] = [root];
  let i = 0;
  const top = () => stack[stack.length - 1]!;
  const addText = (t: string) => {
    if (!t) return;
    const kids = top().children;
    const last = kids[kids.length - 1];
    if (typeof last === "string") kids[kids.length - 1] = last + t;
    else kids.push(t);
  };
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt < 0) {
      addText(decodeEntities(xml.slice(i)));
      break;
    }
    addText(decodeEntities(xml.slice(i, lt)));
    if (xml.startsWith("<!--", lt)) i = skipTo(xml, "-->", lt);
    else if (xml.startsWith("<?", lt)) i = skipTo(xml, "?>", lt);
    else if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt);
      if (end < 0) throw new Error("XML: unterminated CDATA");
      addText(xml.slice(lt + 9, end));
      i = end + 3;
    } else if (xml.startsWith("<!", lt)) i = skipTo(xml, ">", lt);
    else if (xml[lt + 1] === "/") {
      const gt = xml.indexOf(">", lt);
      if (gt < 0) throw new Error("XML: unterminated end tag");
      const name = localName(xml.slice(lt + 2, gt).trim());
      const open = stack.pop();
      if (!open || open === root || open.name !== name) {
        throw new Error(`XML: unexpected </${name}> at offset ${lt}`);
      }
      i = gt + 1;
    } else {
      const gt = findTagEnd(xml, lt);
      const selfClosing = xml[gt - 1] === "/";
      const body = xml.slice(lt + 1, selfClosing ? gt - 1 : gt);
      const m = /^([^\s/>]+)/.exec(body);
      if (!m) throw new Error(`XML: bad start tag at offset ${lt}`);
      const el: El = { name: localName(m[1]!), attrs: {}, children: [] };
      for (const a of body.slice(m[1]!.length).matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        el.attrs[localName(a[1]!)] = decodeEntities(a[2] ?? a[3] ?? "");
      }
      top().children.push(el);
      if (!selfClosing) stack.push(el);
      i = gt + 1;
    }
  }
  if (stack.length !== 1) throw new Error(`XML: unclosed <${top().name}>`);
  return root;
}

function skipTo(xml: string, end: string, from: number): number {
  const at = xml.indexOf(end, from);
  if (at < 0) throw new Error(`XML: missing ${end}`);
  return at + end.length;
}

function findTagEnd(xml: string, from: number): number {
  let quote = "";
  for (let i = from + 1; i < xml.length; i++) {
    const c = xml[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i;
  }
  throw new Error("XML: unterminated start tag");
}

const localName = (n: string) => n.slice(n.indexOf(":") + 1);

const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (whole, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    const named = NAMED[e];
    if (named === undefined) throw new Error(`XML: unknown entity ${whole}`);
    return named;
  });
}
