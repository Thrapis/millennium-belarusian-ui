// Parser for Steam's localization chunks: steamui/localization/<module>_<language>-json.js.
// Each file is a webpack chunk wrapping a single JSON.parse('...') call over a
// JS single-quoted string literal, so decoding takes two layers: JS, then JSON.

const MARKER = "JSON.parse('";

export type TokenTable = Record<string, string>;

export function parseLocFile(src: string): TokenTable {
  const start = src.indexOf(MARKER);
  if (start < 0) throw new Error("Unrecognised localization file: no JSON.parse('...') call");
  if (src.indexOf(MARKER, start + 1) >= 0) {
    throw new Error("Unrecognised localization file: expected exactly one JSON.parse('...') call");
  }
  const bodyStart = start + MARKER.length;
  const bodyEnd = findClosingQuote(src, bodyStart);
  const json = decodeJsSingleQuoted(src.slice(bodyStart, bodyEnd));
  const table = JSON.parse(json) as TokenTable;
  delete table["language"];
  return table;
}

function findClosingQuote(src: string, from: number): number {
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") i++;
    else if (c === "'") return i;
  }
  throw new Error("Unterminated string literal in localization file");
}

const SIMPLE_ESCAPES: Record<string, string> = {
  n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0",
};

export function decodeJsSingleQuoted(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c !== "\\") {
      out += c;
      continue;
    }
    const e = s[++i];
    if (e === undefined) throw new Error("Dangling backslash in string literal");
    if (e in SIMPLE_ESCAPES) out += SIMPLE_ESCAPES[e];
    else if (e === "x") {
      out += String.fromCharCode(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (e === "u" && s[i + 1] === "{") {
      const close = s.indexOf("}", i);
      out += String.fromCodePoint(parseInt(s.slice(i + 2, close), 16));
      i = close;
    } else if (e === "u") {
      out += String.fromCharCode(parseInt(s.slice(i + 1, i + 5), 16));
      i += 4;
    } else if (e === "\r" && s[i + 1] === "\n") i++; // line continuation
    else if (e === "\n" || e === "\r" || e === "\u2028" || e === "\u2029") {
      // line continuation: emits nothing
    } else out += e; // \' \" \\ and identity escapes
  }
  return out;
}
