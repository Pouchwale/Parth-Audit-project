// AN OFFICE FILE AS ITS PARTS (REQUIREMENTS §119): the owner's .docx or .xlsx unzipped, its XML parts parsed only when the
// filler asks for one, and zipped again with every part it did not change exactly as it was.

import { unzip, zipStored } from "../xlsx";
import { el, kids, parse, serializeXml, type XmlElement } from "./xml";

export class Pkg {
  private bytes = new Map<string, Uint8Array>();
  private trees = new Map<string, XmlElement>();
  /** Part names in the zip's own order (new parts go at the end). */
  private order: string[] = [];

  static async open(buffer: ArrayBuffer): Promise<Pkg> {
    const zip = await unzip(buffer);
    const pkg = new Pkg();
    for (const [name, get] of zip) {
      if (name.endsWith("/")) continue;
      pkg.bytes.set(name, await get());
      pkg.order.push(name);
    }
    return pkg;
  }

  has(name: string): boolean {
    return this.bytes.has(name) || this.trees.has(name);
  }

  names(): string[] {
    return [...this.order];
  }

  /** A part as a tree, parsed once; changes to it are written back by build(). */
  xml(name: string): XmlElement | null {
    const known = this.trees.get(name);
    if (known) return known;
    const raw = this.bytes.get(name);
    if (!raw) return null;
    const tree = parse(new TextDecoder("utf-8").decode(raw));
    this.trees.set(name, tree);
    return tree;
  }

  setXml(name: string, tree: XmlElement): void {
    if (!this.has(name)) this.order.push(name);
    this.trees.set(name, tree);
  }

  remove(name: string): void {
    this.bytes.delete(name);
    this.trees.delete(name);
    this.order = this.order.filter((n) => n !== name);
  }

  /** The relationships part of a part ("xl/workbook.xml" -> "xl/_rels/workbook.xml.rels"), made empty when there is none. */
  relsOf(part: string): { name: string; tree: XmlElement } {
    const slash = part.lastIndexOf("/");
    const name = `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
    let tree = this.xml(name);
    if (!tree) {
      tree = el("Relationships", { xmlns: "http://schemas.openxmlformats.org/package/2006/relationships" });
      this.setXml(name, tree);
    }
    return { name, tree };
  }

  /** A relationship id not yet used in a rels tree. */
  static freeRelId(rels: XmlElement): string {
    const used = new Set(kids(rels, "Relationship").map((r) => r.attrs.Id));
    let n = used.size + 1;
    while (used.has(`rId${n}`)) n++;
    return `rId${n}`;
  }

  /** Adds an Override to [Content_Types].xml, unless one names the part already. */
  addContentType(partName: string, type: string): void {
    const types = this.xml("[Content_Types].xml");
    if (!types) return;
    const name = partName.startsWith("/") ? partName : `/${partName}`;
    if (kids(types, "Override").some((o) => (o.attrs.PartName ?? "").toLowerCase() === name.toLowerCase())) return;
    types.children.push(el("Override", { PartName: name, ContentType: type }));
  }

  removeContentType(partName: string): void {
    const types = this.xml("[Content_Types].xml");
    if (!types) return;
    const name = partName.startsWith("/") ? partName : `/${partName}`;
    types.children = types.children.filter((c) => typeof c === "string" || c.local !== "Override" || (c.attrs.PartName ?? "").toLowerCase() !== name.toLowerCase());
  }

  build(): Uint8Array<ArrayBuffer> {
    const encoder = new TextEncoder();
    const files = this.order.map((name) => {
      const tree = this.trees.get(name);
      return { name, data: tree ? encoder.encode(serializeXml(tree)) : (this.bytes.get(name) ?? new Uint8Array()) };
    });
    return zipStored(files);
  }
}

const CUSTOM_PROPS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties";
const VT_NS = "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes";
const FMTID = "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}";

/**
 * The envelope as a custom document property (REQUIREMENTS §81), added to the owner's own docProps/custom.xml where his file
 * has one (Word keeps a few of its own there), else a new part related from the package.
 */
export function setCustomProperty(pkg: Pkg, name: string, value: string): void {
  const PART = "docProps/custom.xml";
  let props = pkg.xml(PART);
  if (!props) {
    props = el("Properties", { xmlns: CUSTOM_PROPS_NS, "xmlns:vt": VT_NS });
    pkg.setXml(PART, props);
    pkg.addContentType(PART, "application/vnd.openxmlformats-officedocument.custom-properties+xml");
    const rels = pkg.relsOf("");
    rels.tree.children.push(el("Relationship", { Id: Pkg.freeRelId(rels.tree), Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties", Target: PART }));
  }
  const existing = kids(props, "property");
  props.children = props.children.filter((c) => typeof c === "string" || c.local !== "property" || c.attrs.name !== name);
  const pid = Math.max(1, ...existing.map((p) => Number(p.attrs.pid) || 1)) + 1;
  const vt = Object.keys(props.attrs).find((k) => props!.attrs[k] === VT_NS)?.replace(/^xmlns:/, "") ?? "vt";
  if (!props.attrs[`xmlns:${vt}`]) props.attrs["xmlns:vt"] = VT_NS;
  props.children.push(el("property", { fmtid: FMTID, pid: String(pid), name }, [el(`${vt}:lpwstr`, {}, [value.slice(0, 255)])]));
}
