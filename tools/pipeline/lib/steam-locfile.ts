// Parser for Steam's localization chunks: steamui/localization/<module>_<language>-json.js.
// Each file is a webpack chunk wrapping a single JSON.parse(<string literal>) call, so
// decoding takes two layers: JS, then JSON. The bundler picks the quote per file:
// '…' (all files until Oct 2026), or `…` / "…" (since then, with non-ASCII as \uXXXX).

const MARKER = /JSON\.parse\((['"`])/g;

export type TokenTable = Record<string, string>;

export function parseLocFile(src: string): TokenTable {
  const calls = [...src.matchAll(MARKER)];
  if (calls.length === 0) throw new Error("Unrecognised localization file: no JSON.parse(<string>) call");
  if (calls.length > 1) {
    throw new Error("Unrecognised localization file: expected exactly one JSON.parse(<string>) call");
  }
  const quote = calls[0]![1]!;
  const bodyStart = calls[0]!.index + calls[0]![0].length;
  const bodyEnd = findClosingQuote(src, bodyStart, quote);
  let body = src.slice(bodyStart, bodyEnd);
  // Template literals turn raw CRLF/CR line breaks into LF.
  if (quote === "`") body = body.replace(/\r\n?/g, "\n");
  const table = JSON.parse(decodeJsSingleQuoted(body)) as TokenTable;
  delete table["language"];
  return table;
}

function findClosingQuote(src: string, from: number, quote: string): number {
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") i++;
    else if (c === quote) return i;
    else if (quote === "`" && c === "$" && src[i + 1] === "{") {
      throw new Error("Unsupported localization file: template literal contains an interpolation");
    }
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
