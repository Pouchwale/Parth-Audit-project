// A SMALL XML READER FOR THE PARTS OF AN UPLOADED WORKBOOK OR WORD FILE
// (REQUIREMENTS §81).
//
// Reading an edited file back needs the parts of an Office package as trees:
// the workbook, its sheets, its shared strings and styles, the Word document,
// the map written at download time. The browser's DOMParser would do, but the
// same readers run under the unit tests in Node, which has none — and one
// reader for both means the tests exercise exactly what a person's browser
// runs. Office XML needs little: elements, attributes, text, CDATA and the five
// entities plus character references. No DTDs, no namespaces resolved: every
// lookup is by LOCAL name ("w:t", "t" and "x:t" are all "t"), because Excel,
// LibreOffice and Word disagree on prefixes and a file must read whichever
// wrote it last.

export interface XmlElement {
  /** The qualified name as written, e.g. "w:sdt". */
  name: string;
  /** The name without its prefix, e.g. "sdt". */
  local: string;
  /** Attributes by their qualified name as written ("w:val", "r:id", "t"). */
  attrs: Record<string, string>;
  children: XmlNode[];
}

export type XmlNode = XmlElement | string;

export class XmlError extends Error {}

const localOf = (name: string) => {
  const colon = name.indexOf(":");
  return colon === -1 ? name : name.slice(colon + 1);
};

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** Character and entity references replaced by what they stand for; an unknown one is left as written. */
export function decodeXmlEntities(s: string): string {
  if (s.indexOf("&") === -1) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return ENTITIES[body] ?? whole;
  });
}

const NAME_END = /[\s/>]/;

/** The document element of an XML text. Throws XmlError when the text is not well-formed enough to read. */
export function parseXml(source: string): XmlElement {
  const src = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const root: XmlElement = { name: "#document", local: "#document", attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  const attrRe = /\s*([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
  let p = 0;
  const n = src.length;
  while (p < n) {
    const lt = src.indexOf("<", p);
    const top = stack[stack.length - 1];
    if (lt === -1) {
      if (stack.length > 1) throw new XmlError("The XML ends inside an element.");
      break;
    }
    if (lt > p && stack.length > 1) top.children.push(decodeXmlEntities(src.slice(p, lt)));
    if (src.startsWith("<?", lt)) {
      const end = src.indexOf("?>", lt + 2);
      if (end === -1) throw new XmlError("An unfinished processing instruction.");
      p = end + 2;
      continue;
    }
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      if (end === -1) throw new XmlError("An unfinished comment.");
      p = end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      if (end === -1) throw new XmlError("An unfinished CDATA section.");
      if (stack.length > 1) top.children.push(src.slice(lt + 9, end));
      p = end + 3;
      continue;
    }
    if (src.startsWith("<!", lt)) {
      // A DOCTYPE, with or without an internal subset — never in an Office part; skipped.
      let depth = 0;
      let q = lt + 2;
      for (; q < n; q++) {
        const ch = src[q];
        if (ch === "[") depth++;
        else if (ch === "]") depth--;
        else if (ch === ">" && depth <= 0) break;
      }
      p = q + 1;
      continue;
    }
    if (src[lt + 1] === "/") {
      const end = src.indexOf(">", lt + 2);
      if (end === -1) throw new XmlError("An unfinished end tag.");
      const name = src.slice(lt + 2, end).trim();
      if (stack.length <= 1 || top.name !== name) throw new XmlError(`An end tag </${name}> that closes nothing.`);
      stack.pop();
      p = end + 1;
      continue;
    }
    // A start tag.
    let q = lt + 1;
    while (q < n && !NAME_END.test(src[q])) q++;
    const name = src.slice(lt + 1, q);
    if (!name) throw new XmlError("A tag with no name.");
    const el: XmlElement = { name, local: localOf(name), attrs: {}, children: [] };
    attrRe.lastIndex = q;
    for (;;) {
      const m = attrRe.exec(src);
      if (!m) break;
      const raw = m[2] ?? m[3] ?? "";
      // A literal line break or tab in an attribute is a space (XML 1.0 §3.3.3); &#10; stays a line break.
      el.attrs[m[1]] = decodeXmlEntities(raw.replace(/[\t\n\r]/g, " "));
      q = attrRe.lastIndex;
    }
    while (q < n && /\s/.test(src[q])) q++;
    let selfClosing = false;
    if (src[q] === "/" && src[q + 1] === ">") {
      selfClosing = true;
      q += 2;
    } else if (src[q] === ">") q += 1;
    else throw new XmlError(`A malformed tag <${name}.`);
    top.children.push(el);
    if (!selfClosing) stack.push(el);
    p = q;
  }
  if (stack.length > 1) throw new XmlError("The XML ends inside an element.");
  const docEl = root.children.find((c): c is XmlElement => typeof c !== "string");
  if (!docEl) throw new XmlError("The XML has no element.");
  return docEl;
}

/** An attribute by its local name, whatever its prefix ("w:val" and "val" both answer "val"). */
export function attr(el: XmlElement, local: string): string | null {
  if (Object.prototype.hasOwnProperty.call(el.attrs, local)) return el.attrs[local];
  for (const key in el.attrs) if (localOf(key) === local) return el.attrs[key];
  return null;
}

/** The element children with this local name (all element children when none is given). */
export function childElements(el: XmlElement, local?: string): XmlElement[] {
  const out: XmlElement[] = [];
  for (const c of el.children) if (typeof c !== "string" && (local === undefined || c.local === local)) out.push(c);
  return out;
}

export function firstChild(el: XmlElement, local: string): XmlElement | null {
  for (const c of el.children) if (typeof c !== "string" && c.local === local) return c;
  return null;
}

/** Every element below `el` (not `el` itself) with this local name, in document order. */
export function descendants(el: XmlElement, local: string): XmlElement[] {
  const out: XmlElement[] = [];
  const walk = (at: XmlElement) => {
    for (const c of at.children) {
      if (typeof c === "string") continue;
      if (c.local === local) out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
}

/** The first element below `el` with this local name, or null. */
export function firstDescendant(el: XmlElement, local: string): XmlElement | null {
  for (const c of el.children) {
    if (typeof c === "string") continue;
    if (c.local === local) return c;
    const inner = firstDescendant(c, local);
    if (inner) return inner;
  }
  return null;
}

/** All the text below `el`, in document order. */
export function textContent(el: XmlElement): string {
  let s = "";
  for (const c of el.children) s += typeof c === "string" ? c : textContent(c);
  return s;
}

/** Bytes of an XML part as text: UTF-8 (the Office default, with or without a byte-order mark) or UTF-16 with its mark. */
export function decodeXmlBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  return new TextDecoder("utf-8").decode(bytes);
}

/** Text safe inside an XML attribute written with double quotes; line breaks and tabs kept as character references. */
export function xmlAttr(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;")
    .replace(/\t/g, "&#9;");
}
