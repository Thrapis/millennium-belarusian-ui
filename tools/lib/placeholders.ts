// Splits a Steam string into text and locked codes (bellingua shows codes as
// <ph> chips). Codes are only the markup Steam's runtime substitutes or renders:
//   %1$s, %s          LocalizeString arguments
//   <1>…</1>          LocalizeReact element slots
//   <br>, <p>         HTML in a few strings
//   [url=…] [b] …     BBCode
//   {s:fileid}        inline value in controller-binding strings
// Text such as <user name>, <none>, {LINK REMOVED} is shown literally and stays translatable.

export interface Piece {
  text: string;
  code?: true;
}

const CODE =
  /%(?:\d+\$)?s|<\/?\d+>|<br\s*\/?>|<\/?p>|\[\/?url(?:=[^\]]*)?\]|\[\/?[biu]\]|\{s:[a-z_]+\}/g;

export function toPieces(s: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const m of s.matchAll(CODE)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ text: m[0], code: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

export function plain(ps: Piece[]): string {
  return ps.map((p) => p.text).join("");
}

export function codesOf(ps: Piece[]): string[] {
  return ps.filter((p) => p.code).map((p) => p.text);
}
