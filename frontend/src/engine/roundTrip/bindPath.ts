// WHERE A VALUE ON SCREEN LIVES IN THE RECORD'S DATA (REQUIREMENTS §81).
//
// "Add options in each and every document of every module so the user can
// upload the Word or Excel with whatever changes they have made." A downloaded
// file is made from the document as it is on screen (utils/documentExport.ts),
// and nothing on screen said which box of the record's data a value came from,
// so an edited file could not be read back. Every value a record view shows —
// an editable box and the words a signed-off record shows in its place — now
// carries a BINDING: the path of that value in the record's data, what kind of
// value it is, its choices, and a label a person reads.
//
//   <input {...bindAttrs(bindPath("rows", { id: row.id }, "viscosity"), "number", { label: "Row 3 (11:00) · Viscosity" })} />
//
// The export writes each bound value into the file with its binding (a hidden
// map in the workbook, a content control in the Word file); an upload reads the
// values back, compares them with what was downloaded, and changes exactly the
// paths whose values were changed (engine/roundTrip/*).
//
// THE PATH GRAMMAR — segments joined by "/":
//   name            an object's property          header   checkpoints   customerSign
//   0, 1, 2 …       an array's item by position   generalComments/2
//   @<id>           the array item whose `id` is  rows/@r-12/viscosity
//   @<key>=<value>  the array item whose <key> is entries/@pcId=PC-05/catchCountApprox
// Values after @ (and property names that are not plain words) are URI-encoded,
// so an id holding "/" or "=" cannot break the path. Prefer @id or @key=value to
// a position wherever the items have one: a line added or removed before it
// then cannot shift a value onto the wrong line.

export const BIND_ATTR = "data-bind";
export const BIND_TYPE_ATTR = "data-bind-type";
export const BIND_OPTIONS_ATTR = "data-bind-options";
export const BIND_LABEL_ATTR = "data-bind-label";
/** On the element that holds one record's document (usually the [data-print-doc] root): the id of the record the paths inside belong to. */
export const BIND_RECORD_ATTR = "data-bind-record";
/** On a <table> that shows a list of the record's data, one row per item: the list's path, e.g. "rows". */
export const BIND_TABLE_ATTR = "data-bind-table";
/** "1" on such a table when a person may add lines to it (a free-row log sheet): lines added in the file become new items. */
export const BIND_APPEND_ATTR = "data-bind-append";
/** On a header cell of such a table: the key of the item's field that column holds (with BIND_TYPE_ATTR / BIND_OPTIONS_ATTR). */
export const BIND_COL_ATTR = "data-bind-col";

/**
 * What kind of value a bound box holds — how a value read back from a file is turned into data.
 *   text       one line of words                       paragraph  words over several lines
 *   number     a number (empty → null)                  date       ISO "YYYY-MM-DD"
 *   time       "HH:MM", 24-hour                         yesno      "Yes" | "No" | ""
 *   select     one of the options' values               bool       true | false (a tick box)
 */
export type BindType = "text" | "paragraph" | "number" | "date" | "time" | "yesno" | "select" | "bool";

export const BIND_TYPES: readonly BindType[] = ["text", "paragraph", "number", "date", "time", "yesno", "select", "bool"];

export interface BindOption {
  value: string;
  label: string;
}

export type PathSeg = { key: string } | { index: number } | { match: { key: string; value: string } };

/** One piece of a path as it is written in code: a property name, a position, { id }, or { key, value }. */
export type PathPart = string | number | { id: string | number } | { key: string; value: string | number };

const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function encodeKey(key: string): string {
  return PLAIN_KEY.test(key) ? key : encodeURIComponent(key);
}

/** The path of a value in a record's data: bindPath("rows", { id: row.id }, "viscosity") → "rows/@r-12/viscosity". */
export function bindPath(...parts: PathPart[]): string {
  return parts
    .map((p) => {
      if (typeof p === "number") return String(Math.trunc(p));
      if (typeof p === "string") return encodeKey(p);
      if ("id" in p) return `@${encodeURIComponent(String(p.id))}`;
      return `@${encodeURIComponent(p.key)}=${encodeURIComponent(String(p.value))}`;
    })
    .join("/");
}

/** The segments of a path, or null when it is not one. */
export function parseBindPath(path: string): PathSeg[] | null {
  if (typeof path !== "string" || !path) return null;
  const segs: PathSeg[] = [];
  try {
    for (const raw of path.split("/")) {
      if (raw === "") return null;
      if (raw.startsWith("@")) {
        const body = raw.slice(1);
        const eq = body.indexOf("=");
        if (eq === -1) segs.push({ match: { key: "id", value: decodeURIComponent(body) } });
        else segs.push({ match: { key: decodeURIComponent(body.slice(0, eq)), value: decodeURIComponent(body.slice(eq + 1)) } });
      } else if (/^\d+$/.test(raw)) segs.push({ index: Number(raw) });
      else segs.push({ key: decodeURIComponent(raw) });
    }
  } catch {
    return null;
  }
  return segs;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Where in an array an @-segment points, or -1. Matches as text, so an id stored as a number is found by "12". */
function findItem(list: unknown[], match: { key: string; value: string }): number {
  return list.findIndex((item) => isObject(item) && item[match.key] !== undefined && item[match.key] !== null && String(item[match.key]) === match.value);
}

/** The value at a path, or undefined when the path does not lead anywhere in this data. */
export function getAtPath(data: unknown, path: string | PathSeg[]): unknown {
  const segs = typeof path === "string" ? parseBindPath(path) : path;
  if (!segs) return undefined;
  let at: unknown = data;
  for (const seg of segs) {
    if ("key" in seg) {
      if (!isObject(at)) return undefined;
      at = at[seg.key];
    } else if ("index" in seg) {
      if (!Array.isArray(at)) return undefined;
      at = at[seg.index];
    } else {
      if (!Array.isArray(at)) return undefined;
      const i = findItem(at, seg.match);
      if (i === -1) return undefined;
      at = at[i];
    }
  }
  return at;
}

/**
 * A path whose missing tail is only NAMED properties can be made: the daily
 * register's `checkpoints` is an object keyed by check point number, and a blank
 * sheet holds `{}` — "checkpoints/7/value" then has no `7` yet, but writing it
 * creates `{ value }` there. Never an array item, never below a value that is
 * not an object: an upload does not invent lines or reshape a record.
 */
function creatable(data: unknown, segs: PathSeg[]): boolean {
  let at: unknown = data;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (at === undefined || at === null) return segs.slice(i).every((s) => "key" in s);
    if ("key" in seg) {
      if (!isObject(at)) return false;
      at = at[seg.key];
    } else if ("index" in seg) {
      if (!Array.isArray(at) || seg.index >= at.length) return false;
      at = at[seg.index];
    } else {
      if (!Array.isArray(at)) return false;
      const k = findItem(at, seg.match);
      if (k === -1) return false;
      at = at[k];
    }
  }
  return true;
}

/** Whether the path leads to a place in this data that could hold a value (its parent exists, or only named properties are missing on the way). */
export function pathExists(data: unknown, path: string | PathSeg[]): boolean {
  const segs = typeof path === "string" ? parseBindPath(path) : path;
  if (!segs || segs.length === 0) return false;
  const parent = getAtPath(data, segs.slice(0, -1));
  const last = segs[segs.length - 1];
  if (parent === undefined || parent === null) return creatable(data, segs);
  if ("key" in last) return isObject(parent);
  if ("index" in last) return Array.isArray(parent) && last.index < parent.length;
  return Array.isArray(parent) && findItem(parent, last.match) !== -1;
}

/**
 * A copy of `data` with `value` at `path` — every object and array along the
 * path copied, nothing else touched. `ok: false` when the path does not lead
 * anywhere in this data (an item that is no longer there, a position past the
 * end): an upload never invents structure the record does not have.
 */
export function setAtPath<T>(data: T, path: string | PathSeg[], value: unknown): { ok: true; data: T } | { ok: false } {
  const segs = typeof path === "string" ? parseBindPath(path) : path;
  if (!segs || segs.length === 0) return { ok: false };
  const step = (at: unknown, i: number): { ok: true; value: unknown } | { ok: false } => {
    const seg = segs[i];
    const last = i === segs.length - 1;
    if ("key" in seg) {
      if (!isObject(at)) return { ok: false };
      if (last) return { ok: true, value: { ...at, [seg.key]: value } };
      // A missing object on the way is made when everything after it is named (see creatable()).
      const below = at[seg.key];
      const made = (below === undefined || below === null) && segs.slice(i + 1).every((s) => "key" in s) ? {} : below;
      const inner = step(made, i + 1);
      return inner.ok ? { ok: true, value: { ...at, [seg.key]: inner.value } } : inner;
    }
    if (!Array.isArray(at)) return { ok: false };
    const index = "index" in seg ? seg.index : findItem(at, seg.match);
    if (index < 0 || index >= at.length) return { ok: false };
    const copy = at.slice();
    if (last) {
      copy[index] = value;
      return { ok: true, value: copy };
    }
    const inner = step(at[index], i + 1);
    if (!inner.ok) return inner;
    copy[index] = inner.value;
    return { ok: true, value: copy };
  };
  const out = step(data, 0);
  return out.ok ? { ok: true, data: out.value as T } : { ok: false };
}

/** The choices of a select, written into an attribute: ["Yes","No"] or [["A","Accepted"], …] when a value and its label differ. */
export function encodeOptions(options: readonly (string | BindOption)[]): string {
  return JSON.stringify(options.map((o) => (typeof o === "string" ? o : o.value === o.label ? o.value : [o.value, o.label])));
}

/** The choices read back from an attribute (or a map), never throwing. */
export function decodeOptions(raw: string | null | undefined): BindOption[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .map((o): BindOption | null =>
        typeof o === "string" ? { value: o, label: o } : Array.isArray(o) && o.length === 2 ? { value: String(o[0]), label: String(o[1]) } : null
      )
      .filter((o): o is BindOption => !!o);
  } catch {
    return [];
  }
}

/**
 * The attributes that bind an element to a value of the record — spread onto
 * the input, select or textarea, AND onto the words a read-only record shows in
 * its place, so a signed-off record's download can be read back too.
 */
export function bindAttrs(
  path: string,
  type: BindType,
  opts: { label?: string; options?: readonly (string | BindOption)[] } = {}
): Record<string, string> {
  const attrs: Record<string, string> = { [BIND_ATTR]: path, [BIND_TYPE_ATTR]: type };
  if (opts.label) attrs[BIND_LABEL_ATTR] = opts.label;
  if (opts.options && opts.options.length) attrs[BIND_OPTIONS_ATTR] = encodeOptions(opts.options);
  return attrs;
}

/** The attributes of a header cell of an appendable table's column. */
export function bindColAttrs(key: string, type: BindType, options?: readonly (string | BindOption)[]): Record<string, string> {
  const attrs: Record<string, string> = { [BIND_COL_ATTR]: key, [BIND_TYPE_ATTR]: type };
  if (options && options.length) attrs[BIND_OPTIONS_ATTR] = encodeOptions(options);
  return attrs;
}

/** A binding as read from an element (null when the element carries none, or a malformed one). */
export interface Binding {
  path: string;
  type: BindType;
  label?: string;
  options: BindOption[];
  /** The record the value belongs to: the nearest [data-bind-record] around it. */
  recordId?: string;
}

export function readBinding(el: Element): Binding | null {
  const path = el.getAttribute(BIND_ATTR);
  const type = el.getAttribute(BIND_TYPE_ATTR) as BindType | null;
  if (!path || !type || !BIND_TYPES.includes(type) || !parseBindPath(path)) return null;
  const label = el.getAttribute(BIND_LABEL_ATTR) ?? undefined;
  const recordId = el.closest(`[${BIND_RECORD_ATTR}]`)?.getAttribute(BIND_RECORD_ATTR) ?? undefined;
  return { path, type, label, options: decodeOptions(el.getAttribute(BIND_OPTIONS_ATTR)), recordId };
}
