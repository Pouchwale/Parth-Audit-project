// THE PARTS OF THE OWNER'S OWN FILE, READ AND WRITTEN AGAIN (REQUIREMENTS §119).
//
// The filler reads a template's XML parts with the same small reader the upload uses (engine/roundTrip/xml.ts: elements,
// attributes, text, no namespaces resolved), changes the tree in place, and writes it out again here. Everything the
// filler does not touch — the owner's styles, his fonts, his pictures, his page set-up — goes back into the file exactly
// as Word or Excel wrote it.

import { parseXml, type XmlElement, type XmlNode } from "../../engine/roundTrip/xml";

export type { XmlElement, XmlNode };

// XML 1.0 forbids most control characters even escaped (Word and Excel call such a file corrupt).
// eslint-disable-next-line no-control-regex
const BAD_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

export const escapeText = (s: string): string => s.replace(BAD_CHARS, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const escapeAttr = (s: string): string =>
  s
    .replace(BAD_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;")
    .replace(/\t/g, "&#9;");

/** A tree as XML text, with the declaration Office writes. */
export function serializeXml(root: XmlElement, declaration = true): string {
  const out: string[] = [];
  if (declaration) out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n');
  const walk = (el: XmlElement) => {
    out.push("<", el.name);
    for (const key in el.attrs) out.push(" ", key, '="', escapeAttr(el.attrs[key]), '"');
    if (el.children.length === 0) {
      out.push("/>");
      return;
    }
    out.push(">");
    for (const c of el.children) {
      if (typeof c === "string") out.push(escapeText(c));
      else walk(c);
    }
    out.push("</", el.name, ">");
  };
  walk(root);
  return out.join("");
}

export const parse = (text: string): XmlElement => parseXml(text);

/** A new element. */
export function el(name: string, attrs: Record<string, string> = {}, children: XmlNode[] = []): XmlElement {
  const colon = name.indexOf(":");
  return { name, local: colon === -1 ? name : name.slice(colon + 1), attrs: { ...attrs }, children: [...children] };
}

/** A deep copy of an element. */
export function clone(e: XmlElement): XmlElement {
  return { name: e.name, local: e.local, attrs: { ...e.attrs }, children: e.children.map((c) => (typeof c === "string" ? c : clone(c))) };
}

export const kids = (e: XmlElement, local?: string): XmlElement[] => e.children.filter((c): c is XmlElement => typeof c !== "string" && (local === undefined || c.local === local));

export const kid = (e: XmlElement, local: string): XmlElement | null => {
  for (const c of e.children) if (typeof c !== "string" && c.local === local) return c;
  return null;
};

/** Every element below `e` with this local name, in document order (not `e` itself). */
export function all(e: XmlElement, local: string): XmlElement[] {
  const out: XmlElement[] = [];
  const walk = (at: XmlElement) => {
    for (const c of at.children) {
      if (typeof c === "string") continue;
      if (c.local === local) out.push(c);
      walk(c);
    }
  };
  walk(e);
  return out;
}

/** An attribute by its local name, whatever its prefix. */
export function attrOf(e: XmlElement, local: string): string | null {
  if (Object.prototype.hasOwnProperty.call(e.attrs, local)) return e.attrs[local];
  for (const key in e.attrs) {
    const colon = key.indexOf(":");
    if ((colon === -1 ? key : key.slice(colon + 1)) === local) return e.attrs[key];
  }
  return null;
}

/** Sets an attribute, keeping the prefix the element already writes it with (else `qualified`). */
export function setAttr(e: XmlElement, qualified: string, value: string): void {
  const colon = qualified.indexOf(":");
  const local = colon === -1 ? qualified : qualified.slice(colon + 1);
  for (const key in e.attrs) {
    const c = key.indexOf(":");
    if ((c === -1 ? key : key.slice(c + 1)) === local) {
      e.attrs[key] = value;
      return;
    }
  }
  e.attrs[qualified] = value;
}

export function removeAttr(e: XmlElement, local: string): void {
  for (const key of Object.keys(e.attrs)) {
    const c = key.indexOf(":");
    if ((c === -1 ? key : key.slice(c + 1)) === local) delete e.attrs[key];
  }
}

export function textOf(e: XmlElement): string {
  let s = "";
  for (const c of e.children) s += typeof c === "string" ? c : textOf(c);
  return s;
}

/** The parent of every element below `root`, found once (the reader keeps no parent links). */
export function parents(root: XmlElement): Map<XmlElement, XmlElement> {
  const map = new Map<XmlElement, XmlElement>();
  const walk = (at: XmlElement) => {
    for (const c of at.children) {
      if (typeof c === "string") continue;
      map.set(c, at);
      walk(c);
    }
  };
  walk(root);
  return map;
}

/** Inserts `node` into `parent` right after `after` (at the end when `after` is not a child). */
export function insertAfter(parent: XmlElement, after: XmlElement, node: XmlElement): void {
  const at = parent.children.indexOf(after);
  if (at === -1) parent.children.push(node);
  else parent.children.splice(at + 1, 0, node);
}

export function removeChild(parent: XmlElement, child: XmlElement): void {
  const at = parent.children.indexOf(child);
  if (at !== -1) parent.children.splice(at, 1);
}
