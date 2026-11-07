import { PrintedWordsAt } from "./PrintedWordsAt";
import type { PrintedWords } from "../../types";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentDefinition, FlyCatcherData, FlyCatcherEntry, PCLocation, RecordInstance } from "../../types";
import { DocumentHeader } from "../documents/DocumentHeader";
import { recordHeaderEditing, useHeaderEditing, type RecordHeaderHost } from "../documents/HeaderEditing";
import { isEditableStatus, recordHeaderDefaults, saveDraft } from "../../engine/recordLifecycle";
import { documentRepository } from "../../data/repositories/documentRepository";
import { waitsUntil } from "../../engine/notBeforeDay";
import { formatEditFor } from "../../data/formatEdits";
import { masterRepository } from "../../data/repositories/masterRepository";
import { recordRepository } from "../../data/repositories/recordRepository";
import { useAppStore } from "../../store/AppStore";
import { makeRng } from "../../utils/random";
import { formatDisplayDate } from "../../utils/date";
import { bindProps, flyCatcherBind, type FlyEntryField } from "../../engine/roundTrip/bindingsFor";
import { visitsInMonth } from "../../engine/flyRegister";
import { TUBE_LIGHT_DUE, TUBE_LIGHT_INSTALLED } from "../../engine/flyPattern";
import { FHR18_PAPER_CELLS, FHR18_TITLE, Fhr18GridHead, Fhr18Legend, paperDate } from "./FlyCatcherRegisterSheet";

// A FLY CATCHER VISIT ON ITS OWN PAGE, LAID OUT AS F/HR/18 PRINTS — the
// company's own Word original (source-documents/F-HR-18_Fly Catcher Inspection
// & Cleaning Record.doc, sent 16-Oct-2026; REQUIREMENTS §111 part 9): the
// header block, the "Month & Year" line, the legend of the thirteen units and
// where they hang, then the grid — PC ID NO. | DATE OF SERVICE | FLIES CATCH
// COUNT APPROX. | DATE OF TUBE LIGHT INSTALLATION | DUE DATE FOR TUBE LIGHT
// REPLACEMENT | CLEANING DONE BY | VERIFIED BY — two lines per unit, as on the
// paper and on the monthly register (FlyCatcherRegisterSheet.tsx): the month's
// two fortnightly visits in date order. This visit's line is typed in here, and
// so is the month's other visit's while it is still a draft — saved into that
// visit through its own saveDraft, as the register's Edit register does, so the
// change is in that visit's history. A visit already submitted or verified is
// shown read only (it is corrected from its own page); with no other visit on
// file the line is left blank with the tube-light dates dittoed.
// An empty flies catch count on a draft line is filled in automatically, 0 to
// 2 (the owner, 30-10-26), and a July visit carries a reminder to change those
// numbers to the flies actually counted. Every box the person fills on
// the paper is a box here — the Month & Year, the count, both tube-light dates
// and the two names; the date of service is the visit's own date, written as
// the paper writes it. Nothing the paper does not print is drawn: no Location
// column, no note. The print and the downloaded Word file are this sheet
// (utils/documentExport.ts).

type EntryPatch = Partial<Omit<FlyCatcherEntry, "pcId">>;

// The paper has two lines per unit — the month's two fortnightly visits.
const MIN_LINES_PER_UNIT = 2;
const DITTO = '"';
const hasCount = (e: FlyCatcherEntry) => e.catchCountApprox !== null && e.catchCountApprox !== undefined;
/** 1 -> "01", as the specimen writes a count. */
/** A count as plain figures - 1, 2, 12 - not padded (the owner, 7-Nov-2026: "like 1, 2 and not 01, 02"). */
const paperCount = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
// What is typed into the month's other visit is saved this long after the last keystroke, as on the register.
const AUTOSAVE_MS = 700;
// UNITS TO A PRINTED PAGE (the owner, 30-10-26): eight, as the register's first page holds PC-01 to PC-08. Each page
// is a page of its own - the header band, Month & Year, the legend and the headings, then its units - as the register
// prints its two (FlyCatcherRegisterSheet.tsx), so a second page never starts at the paper's edge with only headings.
const UNITS_PER_PAGE = 8;

/** June, July and August — the fly season (the owner, 30-10-26): counts filled in automatically run 2 to 4, not 0 to 2. */
export const isFlySeasonMonth = (dateISO: string | null | undefined) => ["06", "07", "08"].includes((dateISO ?? "").slice(5, 7));

/**
 * The range a count filled in automatically falls in: by the month of the line's tube-light installation date (the
 * owner, 30-10-26) — 2 to 4 for June-August, else 0 to 2 — or, on a line with no installation date yet, the visit's.
 */
export const autoFlyRange = (visitISO: string, installISO?: string | null): [number, number] =>
  isFlySeasonMonth(installISO || visitISO) ? [2, 4] : [0, 2];

/** The count filled in automatically on a line, in its range (autoFlyRange); random by unit, visit and installation date, the same on every device. */
export function autoFlyCount(pcId: string, visitISO: string, installISO?: string | null): number {
  const [low, high] = autoFlyRange(visitISO, installISO);
  return low + Math.min(high - low, Math.floor(makeRng(`fly-auto|${pcId}|${visitISO}|${installISO ?? ""}`).next() * (high - low + 1)));
}

/**
 * THE COUNT COMES WITH THE DATE (the owner, 30-10-26): an empty count on a line with a tube-light installation date is
 * filled in automatically (autoFlyCount); a line with no installation date has no count. Null when nothing changes.
 */
export function withAutoCounts(data: FlyCatcherData, visitISO: string): FlyCatcherData | null {
  let changed = false;
  const entries = data.entries.map((e) => {
    if (!e.tubeLightInstallDate) {
      if (!hasCount(e)) return e;
      changed = true;
      return { ...e, catchCountApprox: null };
    }
    if (hasCount(e)) return e;
    changed = true;
    return { ...e, catchCountApprox: autoFlyCount(e.pcId, visitISO, e.tubeLightInstallDate) };
  });
  return changed ? { ...data, entries } : null;
}

/**
 * THE FIRST LINE LEADS (the owner, 30-10-26): a unit whose first line has no tube-light installation date has none on
 * the lines below it either - the dates come down from the first line (carryDatesDown, and typing on it). The same
 * object back when nothing changes.
 */
export function clearDatesUnderBlankFirst(data: FlyCatcherData, first: FlyCatcherData): FlyCatcherData {
  let cleared = false;
  const entries = data.entries.map((e) => {
    const top = first.entries.find((x) => x.pcId === e.pcId);
    if (!top || top.tubeLightInstallDate || (!e.tubeLightInstallDate && !e.tubeLightDueDate)) return e;
    cleared = true;
    return { ...e, tubeLightInstallDate: null, tubeLightDueDate: null };
  });
  return cleared ? { ...data, entries } : data;
}

/**
 * A VISIT STILL BEING DRAFTED FOLLOWS MASTER DATA'S FLY CATCHERS (the owner, 30-10-26): a visit lists the units Master
 * Data held when it was started, so any unit added since is put after them, blank — its tube light's installation
 * date too, typed by hand, and the due date following from it (tubeLightDueFor) — and any unit deleted from Master
 * Data since is taken off it. Null when nothing changes; with no units in Master Data at all (not loaded), nothing is
 * taken off. A visit submitted or verified keeps exactly the units it was signed with.
 */
export function withMasterUnits(data: FlyCatcherData, pcLocations: readonly PCLocation[]): FlyCatcherData | null {
  const listed = new Set(pcLocations.map((pc) => pc.id));
  const kept = listed.size ? data.entries.filter((e) => listed.has(e.pcId)) : data.entries;
  const held = new Set(kept.map((e) => e.pcId));
  const added = pcLocations.filter((pc) => !held.has(pc.id));
  if (added.length === 0 && kept.length === data.entries.length) return null;
  return {
    ...data,
    entries: [
      ...kept,
      ...added.map((pc) => ({ pcId: pc.id, catchCountApprox: null, tubeLightInstallDate: null, tubeLightDueDate: null, cleaningDoneBy: "", verifiedBy: "" })),
    ],
  };
}

/**
 * THE DUE DATE FOLLOWS THE INSTALLATION DATE (the owner, 30-10-26): a year less a day after it, as the register's own
 * pair reads — installed 24-11-2025, due 23-11-2026. Null for a date that is not a whole yyyy-mm-dd.
 */
export function tubeLightDueFor(installISO: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(installISO ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]) + 1, Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** What typing an installation date writes: the date, and the due date that follows from it (left as it was when cleared). */
const installPatch = (value: string): EntryPatch => {
  const due = tubeLightDueFor(value);
  return due ? { tubeLightInstallDate: value, tubeLightDueDate: due } : { tubeLightInstallDate: value || null };
};

/**
 * THE TUBE LIGHT'S DATES CARRIED DOWN (the owner, 30-10-26): a unit's line with no installation date takes the one on
 * the nearest line above it that has one, with that line's due date (or the one following from it). A date already
 * written is never changed. The same object back when nothing was carried.
 */
export function carryDatesDown(data: FlyCatcherData, above: readonly FlyCatcherData[]): FlyCatcherData {
  let carried = false;
  const entries = data.entries.map((e) => {
    if (e.tubeLightInstallDate) return e;
    for (let k = above.length - 1; k >= 0; k--) {
      const from = above[k].entries.find((x) => x.pcId === e.pcId);
      if (from?.tubeLightInstallDate) {
        carried = true;
        return { ...e, tubeLightInstallDate: from.tubeLightInstallDate, tubeLightDueDate: from.tubeLightDueDate ?? tubeLightDueFor(from.tubeLightInstallDate) };
      }
    }
    return e;
  });
  return carried ? { ...data, entries } : data;
}

/** July: the counts filled in automatically are to be changed to the flies actually counted. */
export const isJulyVisit = (dateISO: string) => dateISO.slice(5, 7) === "07";

/** A line of a unit: this visit (typed in), another visit of the month (shown), or the paper's blank line. */
interface MonthLine {
  record?: RecordInstance<FlyCatcherData>;
  current?: boolean;
}

/** This visit and the month's other visit, in date order: two lines a unit, as the paper prints them (the owner,
 *  31-Oct-2026: "there are only 2 rows per PC"). A month with a third visit pairs this one with the visit nearest it in
 *  date (the earlier on a tie); a month with no other visit yet keeps the paper's blank line. */
function monthLines(record: RecordInstance<FlyCatcherData>): MonthLine[] {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(record.dueDate);
  const days = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
  const others = m
    ? (visitsInMonth(Number(m[1]), Number(m[2]) - 1, record.isDemo).filter((r) => r.id !== record.id) as RecordInstance<FlyCatcherData>[])
        .sort((a, b) => Math.abs(days(a.dueDate) - days(record.dueDate)) - Math.abs(days(b.dueDate) - days(record.dueDate)) || (a.dueDate < b.dueDate ? -1 : 1))
        .slice(0, MIN_LINES_PER_UNIT - 1)
    : [];
  const lines: MonthLine[] = [...others.map((r) => ({ record: r })), { record, current: true }].sort((a, b) =>
    a.record!.dueDate < b.record!.dueDate ? -1 : a.record!.dueDate > b.record!.dueDate ? 1 : 0,
  );
  while (lines.length < MIN_LINES_PER_UNIT) lines.push({});
  return lines;
}

export function FlyCatcherRecordView({
  doc,
  record,
  editable,
  onChange,
  header,
}: {
  doc: DocumentDefinition;
  record: RecordInstance<FlyCatcherData>;
  editable: boolean;
  onChange: (data: FlyCatcherData) => void;
  /** The record page's: its header typed over in place (REQUIREMENTS §86). */
  header?: RecordHeaderHost;
}) {
  const data = record.data;
  const master0 = masterRepository.get();
  // The pages the sheet takes: the units shown (the visit's own, and Master Data's while it is a draft), eight a page.
  const pageCount = Math.max(1, Math.ceil(((editable ? withMasterUnits(data, master0.pcLocations) : null) ?? data).entries.length / UNITS_PER_PAGE));
  const recordDefaults = recordHeaderDefaults(record);
  const headerDefaults = pageCount > 1 ? { ...recordDefaults, page: `1 of ${pageCount}` } : recordDefaults;
  const { edit: headerEdit, panel: headerPanel } = useHeaderEditing({
    doc: header ? doc : undefined,
    enabled: header?.enabled,
    record: recordHeaderEditing(header, record.headerBlock, headerDefaults),
  });
  const master = masterRepository.get();
  const pcLocations = master.pcLocations;
  // The paper's own title and date — until the format itself is changed (§86).
  const formatChanged = formatEditFor(doc.id);
  // The units drawn: the visit's own — while it is a draft, as Master Data now lists them (added or deleted since it was started).
  const shown = (editable ? withMasterUnits(data, pcLocations) : null) ?? data;

  const updateEntry = (pcId: string, patch: EntryPatch) => {
    onChange({
      ...shown,
      entries: shown.entries.map((e) => (e.pcId === pcId ? { ...e, ...patch } : e)),
    });
  };

  // Every value below carries where it lives in the record, so an edited Word
  // or Excel file can be read back (REQUIREMENTS §81, engine/roundTrip/bindingsFor.ts).
  const bound = (pcId: string, field: FlyEntryField) => bindProps(flyCatcherBind.entry(pcId, field));
  const serviceDate = paperDate(record.dueDate);
  const lines = monthLines(record);

  // THE MONTH'S OTHER VISIT, TYPED IN HERE: what is typed is held by visit and saved through that visit's own
  // saveDraft a moment after the last keystroke (and on leaving the page), exactly as the register saves it.
  const { currentUser, bump } = useAppStore();
  const user = useRef(currentUser);
  user.current = currentUser;
  const pending = useRef(new Map<string, FlyCatcherData>());
  const [dirty, setDirty] = useState(false);
  const [keystrokes, setKeystrokes] = useState(0);
  const flush = useCallback(() => {
    if (pending.current.size === 0) return;
    for (const [id, next] of pending.current) {
      const rec = recordRepository.getById(id) as RecordInstance<FlyCatcherData> | undefined;
      // Only a draft is written to: a visit submitted meanwhile keeps exactly what was submitted.
      if (rec && isEditableStatus(rec.status)) saveDraft(rec, next, user.current);
    }
    pending.current.clear();
    setDirty(false);
    bump();
  }, [bump]);
  useEffect(() => {
    if (!dirty) return;
    const h = window.setTimeout(flush, AUTOSAVE_MS);
    return () => window.clearTimeout(h);
  }, [dirty, keystrokes, flush]);
  useEffect(() => () => flush(), [record.id, flush]);
  useEffect(() => {
    if (!dirty) return;
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("offline", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("offline", flush);
    };
  }, [dirty, flush]);
  const dataOf = (r: RecordInstance<FlyCatcherData>): FlyCatcherData => pending.current.get(r.id) ?? r.data;
  // NOT BEFORE ITS DAY (REQUIREMENTS §201): another visit's line is written from that visit's day, not before.
  const flyDoc = documentRepository.getById(record.documentId);
  const otherEditable = (r: RecordInstance<FlyCatcherData> | undefined): boolean => editable && !!r && isEditableStatus(r.status) && !waitsUntil(flyDoc, r);
  const updateOther = (r: RecordInstance<FlyCatcherData>, pcId: string, patch: EntryPatch) => {
    const base = dataOf(r);
    const entries = base.entries.some((x) => x.pcId === pcId)
      ? base.entries.map((x) => (x.pcId === pcId ? { ...x, ...patch } : x))
      : [...base.entries, { pcId, catchCountApprox: null, tubeLightInstallDate: null, tubeLightDueDate: null, cleaningDoneBy: "", verifiedBy: "", ...patch }];
    pending.current.set(r.id, { ...base, entries });
    setDirty(true);
    setKeystrokes((n) => n + 1);
  };
  // A TUBE-LIGHT DATE TYPED ON A LINE IS WRITTEN ON THE UNIT'S LINES BELOW IT TOO (the owner, 30-10-26) — each still
  // being drafted, into its own visit: it is the same tube. A line above keeps what it says.
  const setDates = (from: number, pcId: string, patch: EntryPatch | ((line: MonthLine) => EntryPatch)) => {
    lines.forEach((line, j) => {
      if (j < from) return;
      const p = typeof patch === "function" ? patch(line) : patch;
      if (line.current) {
        if (editable) updateEntry(pcId, p);
      } else if (line.record && otherEditable(line.record)) updateOther(line.record, pcId, p);
    });
  };
  // AN INSTALLATION DATE TYPED: the date and its due date on this line and the unit's lines below, and on each a count
  // generated from that date (autoFlyCount: 2 to 4 for June-August, else 0 to 2); a date cleared takes the count with it.
  const setInstall = (from: number, pcId: string, value: string) => {
    const dates = installPatch(value);
    setDates(from, pcId, (line) => {
      const r = line.record;
      if (!r) return dates;
      return { ...dates, catchCountApprox: dates.tubeLightInstallDate ? autoFlyCount(pcId, r.dueDate, dates.tubeLightInstallDate) : null };
    });
  };

  // WHEN THE PAGE OPENS (the owner, 30-10-26), on every line still being drafted — this visit's through the page's
  // own save, the month's other visit's through that visit's saveDraft: a unit added in Master Data since the visit
  // was started is written into it, and one deleted there taken off it (withMasterUnits), a line with no tube-light installation date takes the one on the
  // line above (carryDatesDown) - and none where the unit's first line has none (clearDatesUnderBlankFirst) - and then
  // every empty count on a line with an installation date is filled in, in that date's range, while a line with no
  // installation date has no count (withAutoCounts). Once per visit and Master Data's units: a unit added later runs it again.
  const unitsKey = pcLocations.map((pc) => pc.id).join(",");
  const autoFilled = useRef(new Set<string>());
  useEffect(() => {
    if (!editable) return;
    const units = masterRepository.get().pcLocations;
    const items = monthLines(record).map((line) => {
      const r = line.record;
      if (!r) return null;
      const key = `${r.id}|${unitsKey}`;
      const writable = (line.current || (isEditableStatus(r.status) && !waitsUntil(flyDoc, r))) && !autoFilled.current.has(key);
      if (writable) autoFilled.current.add(key);
      const base = line.current ? record.data : r.data;
      return { line, r, writable, base, data: (writable ? withMasterUnits(base, units) : null) ?? base };
    });
    const first = items.find((x) => !!x);
    items.forEach((it, j) => {
      if (!it?.writable) return;
      const led = first && it !== first ? clearDatesUnderBlankFirst(it.data, first.data) : it.data;
      const carried = carryDatesDown(led, items.slice(0, j).flatMap((x) => (x ? [x.data] : [])));
      it.data = withAutoCounts(carried, it.r.dueDate) ?? carried;
    });
    let changed = false;
    for (const it of items) {
      if (!it || !it.writable || it.data === it.base) continue;
      // This visit too is written through its own saveDraft, not the page's onChange: the record page loads the
      // stored visit just after this runs (its own effect comes after this one's), which would undo an onChange.
      const stored = (it.line.current ? (recordRepository.getById(it.r.id) as RecordInstance<FlyCatcherData> | undefined) : undefined) ?? it.r;
      saveDraft(stored, it.data, user.current, {
        action: "assistant-edit",
        note: "Fly catcher units as in Master Data (added or deleted), tube light dates following the first line, and flies catch counts filled in automatically where a tube light installation date is (2 to 4 for June-August, else 0 to 2)",
      });
      changed = true;
    }
    if (changed) bump();
    // The page's own edits never re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id, editable, unitsKey]);

  // What a line holds for a unit: this visit's entry as it is being typed; another visit's once it has been carried out.
  const entryOf = (line: MonthLine, current: FlyCatcherEntry, pcId: string): FlyCatcherEntry | undefined => {
    if (line.current) return current;
    const other = line.record ? dataOf(line.record) : undefined;
    return other && other.entries.some(hasCount) ? other.entries.find((x) => x.pcId === pcId) : undefined;
  };

  // THE MONTH'S OTHER VISIT'S LINE, EDITABLE: the same boxes as this visit's line, written into that visit. Not bound
  // for the Word/Excel round trip: this page's download is this visit's record.
  const otherEditLine = (e: FlyCatcherEntry, r: RecordInstance<FlyCatcherData>, i: number, pcCell: React.ReactNode) => {
    const o = dataOf(r).entries.find((x) => x.pcId === e.pcId);
    const label = `${e.pcId}, visit of ${formatDisplayDate(r.dueDate)}`;
    return (
      <tr key={r.id} className="register-row" data-visit={r.dueDate} data-line="other" title={`${e.pcId} — visit of ${formatDisplayDate(r.dueDate)} (${r.status})`}>
        {pcCell}
        <td className="date-cell notranslate" translate="no">
          {paperDate(r.dueDate)}
        </td>
        <td className="edit-cell">
          <input
            type="number"
            min={0}
            step={1}
            className="input input-sm fhr18-input"
            data-field="count"
            aria-label={`${label} — flies catch count approx.`}
            // The count comes with the tube light's installation date (the owner, 30-10-26).
            disabled={!o?.tubeLightInstallDate}
            title={o?.tubeLightInstallDate ? undefined : "Enter the date of tube light installation first"}
            value={o?.catchCountApprox ?? ""}
            onChange={(ev) => {
              const n = Number(ev.target.value);
              updateOther(r, e.pcId, { catchCountApprox: ev.target.value === "" || !Number.isFinite(n) ? null : Math.max(0, n) });
            }}
          />
        </td>
        <td className="edit-cell">
          <input
            type="date"
            className="input input-sm fhr18-input"
            data-field="installed"
            aria-label={`${label} — date of tube light installation`}
            data-empty={o?.tubeLightInstallDate ? undefined : ""}
            value={o?.tubeLightInstallDate ?? ""}
            onChange={(ev) => setInstall(i, e.pcId, ev.target.value)}
          />
        </td>
        <td className="edit-cell">
          <input
            type="date"
            className="input input-sm fhr18-input"
            data-field="due"
            aria-label={`${label} — due date for tube light replacement`}
            data-empty={o?.tubeLightDueDate ? undefined : ""}
            value={o?.tubeLightDueDate ?? ""}
            onChange={(ev) => setDates(i, e.pcId, { tubeLightDueDate: ev.target.value || null })}
          />
        </td>
        <td className="edit-cell">
          <input
            className="input input-sm fhr18-input notranslate"
            translate="no"
            list="fhr18-record-people"
            data-field="cleaning"
            aria-label={`${label} — cleaning done by`}
            value={o?.cleaningDoneBy ?? ""}
            onChange={(ev) => updateOther(r, e.pcId, { cleaningDoneBy: ev.target.value })}
          />
        </td>
        <td className="edit-cell">
          <input
            className="input input-sm fhr18-input notranslate"
            translate="no"
            list="fhr18-record-people"
            data-field="verified"
            aria-label={`${label} — verified by`}
            value={o?.verifiedBy ?? ""}
            onChange={(ev) => updateOther(r, e.pcId, { verifiedBy: ev.target.value })}
          />
        </td>
      </tr>
    );
  };

  // ANOTHER LINE OF THE UNIT, AS THE REGISTER WRITES IT: the month's other visit — typed in here while it is a draft
  // (above), read only once it is submitted or verified — or the paper's blank line. The tube-light dates are the
  // register's fixed pair, dittoed under a line that reads the same. A line with nothing written stays off the
  // printout unless it is the unit's first (it carries the unit's number), as on the register (REQUIREMENTS §126).
  const otherLine = (e: FlyCatcherEntry, i: number, pcCell: React.ReactNode) => {
    const line = lines[i];
    const r = line.record;
    if (r && otherEditable(r)) return otherEditLine(e, r, i, pcCell);
    const o = entryOf(line, e, e.pcId);
    const above = i > 0 ? entryOf(lines[i - 1], e, e.pcId) : undefined;
    const tube = (value: string | null | undefined, previous: string | null | undefined) =>
      !value ? "" : i > 0 && previous === value ? DITTO : paperDate(value);
    return (
      <tr
        key={r?.id ?? `blank-${i}`}
        className="register-row"
        data-visit={r?.dueDate}
        data-empty-line={i > 0 && !o ? "" : undefined}
        title={r ? `${e.pcId} — visit of ${formatDisplayDate(r.dueDate)} (${r.status}) · open that visit to change this line` : undefined}
      >
        {pcCell}
        <td className="date-cell notranslate" translate="no">
          {o && r ? paperDate(r.dueDate) : ""}
        </td>
        {/* A visit after today keeps its count blank until the day, on the screen and on paper (REQUIREMENTS §201). */}
        <td className="count-cell" title={r && waitsUntil(flyDoc, r) ? `Written from ${formatDisplayDate(r.dueDate)}` : undefined}>
          {paperCount(r && waitsUntil(flyDoc, r) ? null : o?.catchCountApprox)}
        </td>
        <td className="notranslate" translate="no">
          {tube(o?.tubeLightInstallDate ?? TUBE_LIGHT_INSTALLED, above?.tubeLightInstallDate ?? TUBE_LIGHT_INSTALLED)}
        </td>
        <td className="notranslate" translate="no">
          {tube(o?.tubeLightDueDate ?? TUBE_LIGHT_DUE, above?.tubeLightDueDate ?? TUBE_LIGHT_DUE)}
        </td>
        {/* The names signed read exactly as they were written, in either language (REQUIREMENTS §58). */}
        <td className="name-cell notranslate" translate="no">
          {o?.cleaningDoneBy ?? ""}
        </td>
        <td className="name-cell notranslate" translate="no">
          {o?.verifiedBy ?? ""}
        </td>
      </tr>
    );
  };
  // EVERY PRINTED WORD OF THE VISIT'S SHEET, TYPED OVER ON IT (REQUIREMENTS §137): each catcher's number and area, the
  // visit's date on each line, the headings - this visit's own words once changed; Master Data keeps the plant's.
  const host = { words: data.printedWords, editable, onWords: (printedWords: PrintedWords) => onChange({ ...data, printedWords }) };
  const at = (place: string, original: string, label?: string) => (
    <PrintedWordsAt place={place} words={data.printedWords} original={original} editable={editable} onWords={host.onWords} label={label} />
  );

  // The printed words read on the pages after the first: as typed over, not typed in there.
  const readOnlyHost = { ...host, editable: false };
  const pages: FlyCatcherEntry[][] = [];
  for (let k = 0; k < shown.entries.length; k += UNITS_PER_PAGE) pages.push(shown.entries.slice(k, k + UNITS_PER_PAGE));
  if (pages.length === 0) pages.push([]);
  // One page's grid: the headings, the paper's gap under them, then the page's units, two lines each.
  const grid = (units: FlyCatcherEntry[], first: boolean) => (
        <div className="doc-table register-grid-wrap">
          <table className="register-grid fhr18-grid">
            {first ? <Fhr18GridHead host={host} /> : <Fhr18GridHead host={readOnlyHost} />}
            <tbody className="fhr18-gap" data-gap={first ? "first" : "next"} aria-hidden="true">
              <tr>
                <td colSpan={7} />
              </tr>
            </tbody>
            {units.map((e) => {
              const label = `${e.pcId}, visit of ${formatDisplayDate(record.dueDate)}`;
              return (
                <tbody key={e.pcId} className="fhr18-unit" data-pc={e.pcId}>
                  {lines.map((line, i) => {
                  // The unit's number, merged down its lines, on whichever line comes first.
                  const pcCell =
                    i === 0 ? (
                      <td className="pc-cell notranslate" translate="no" rowSpan={lines.length}>
                        {at(`pc:${e.pcId}`, e.pcId, "Catcher")}
                      </td>
                    ) : null;
                  if (!line.current) return otherLine(e, i, pcCell);
                  return (
                  <tr key={record.id} className="register-row" data-visit={record.dueDate}>
                    {pcCell}
                    {/* The visit's date, as the paper writes it (3/08/26). */}
                    <td className="date-cell notranslate" translate="no">
                      {at(`date:${e.pcId}`, serviceDate, "Date of service")}
                    </td>
                    <td className="edit-cell">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="input input-sm fhr18-input"
                        data-field="count"
                        {...bound(e.pcId, "catchCountApprox")}
                        aria-label={`${label} — flies catch count approx.`}
                        // The count comes with the tube light's installation date (the owner, 30-10-26).
                        disabled={!editable || !e.tubeLightInstallDate}
                        title={editable && !e.tubeLightInstallDate ? "Enter the date of tube light installation first" : undefined}
                        value={e.catchCountApprox ?? ""}
                        onChange={(ev) => {
                          const n = Number(ev.target.value);
                          updateEntry(e.pcId, { catchCountApprox: ev.target.value === "" || !Number.isFinite(n) ? null : Math.max(0, n) });
                        }}
                      />
                    </td>
                    <td className="edit-cell">
                      <input
                        type="date"
                        className="input input-sm fhr18-input"
                        data-field="installed"
                        {...bound(e.pcId, "tubeLightInstallDate")}
                        // An empty date prints empty, not "dd-mm-yyyy" (REQUIREMENTS §111).
                        data-empty={e.tubeLightInstallDate ? undefined : ""}
                        aria-label={`${label} — date of tube light installation`}
                        disabled={!editable}
                        value={e.tubeLightInstallDate ?? ""}
                        onChange={(ev) => setInstall(i, e.pcId, ev.target.value)}
                      />
                    </td>
                    <td className="edit-cell">
                      <input
                        type="date"
                        className="input input-sm fhr18-input"
                        data-field="due"
                        {...bound(e.pcId, "tubeLightDueDate")}
                        data-empty={e.tubeLightDueDate ? undefined : ""}
                        aria-label={`${label} — due date for tube light replacement`}
                        disabled={!editable}
                        value={e.tubeLightDueDate ?? ""}
                        onChange={(ev) => setDates(i, e.pcId, { tubeLightDueDate: ev.target.value || null })}
                      />
                    </td>
                    {/* The names signed read exactly as they were written, in either language (REQUIREMENTS §58). */}
                    <td className="edit-cell">
                      <input
                        className="input input-sm fhr18-input notranslate"
                        translate="no"
                        list="fhr18-record-people"
                        data-field="cleaning"
                        {...bound(e.pcId, "cleaningDoneBy")}
                        aria-label={`${label} — cleaning done by`}
                        disabled={!editable}
                        value={e.cleaningDoneBy}
                        onChange={(ev) => updateEntry(e.pcId, { cleaningDoneBy: ev.target.value })}
                      />
                    </td>
                    <td className="edit-cell">
                      <input
                        className="input input-sm fhr18-input notranslate"
                        translate="no"
                        list="fhr18-record-people"
                        data-field="verified"
                        {...bound(e.pcId, "verifiedBy")}
                        aria-label={`${label} — verified by`}
                        disabled={!editable}
                        value={e.verifiedBy}
                        onChange={(ev) => updateEntry(e.pcId, { verifiedBy: ev.target.value })}
                      />
                    </td>
                  </tr>
                  );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
  );

  return (
    <div className="fhr18-record" data-bind-record={record.id}>
      <section className="register-page">
        <DocumentHeader
          doc={doc}
          title={formatChanged?.name ? undefined : FHR18_TITLE}
          pageLabel={record.headerBlock?.page ?? headerDefaults.page}
          edit={headerEdit}
          labels={FHR18_PAPER_CELLS}
          dotDates
        />
        {headerPanel}

        {/* "Month & Year ____": the underlined blank the person fills. */}
        <div className="fhr18-month">
          <label className="k" htmlFor="fhr18-month-year">
            Month &amp; Year
          </label>
          <input
            id="fhr18-month-year"
            className="v fhr18-month-input notranslate"
            translate="no"
            {...bindProps(flyCatcherBind.monthYear())}
            disabled={!editable}
            value={data.monthYear}
            onChange={(e) => onChange({ ...data, monthYear: e.target.value })}
          />
        </div>

        <Fhr18Legend pcLocations={pcLocations} host={host} />

        {/* JULY: the reminder to change the counts filled in automatically (the owner, 30-10-26). On the screen only. */}
        {isJulyVisit(record.dueDate) && (
          <div
            className="text-sm text-warning no-print"
            role="alert"
            data-section="fhr18-july-reminder"
            style={{ marginTop: 10, padding: "8px 12px", border: "1px solid var(--color-warning)", borderRadius: "var(--radius-sm)" }}
          >
            <strong>Reminder — July, fly season:</strong> the flies catch counts were filled in automatically (2 to 4 where the tube light was installed in June, July or August, else 0 to 2). Count the
            flies on each glue board and change the numbers to what you found.
          </div>
        )}

        {grid(pages[0], true)}
      </section>

      {/* The pages after the first: the same header block, read as it stands (typed over on the first page), then their units. */}
      {pages.slice(1).map((units, k) => (
        <section className="register-page" key={`page-${k + 2}`} data-page={k + 2}>
          <DocumentHeader doc={doc} title={formatChanged?.name ? undefined : FHR18_TITLE} pageLabel={`${k + 2} of ${pages.length}`} labels={FHR18_PAPER_CELLS} dotDates />
          <div className="fhr18-month">
            <span className="k">Month &amp; Year</span>
            <span className="v notranslate" translate="no">
              {data.monthYear}
            </span>
          </div>
          <Fhr18Legend pcLocations={pcLocations} host={readOnlyHost} />
          {grid(units, false)}
        </section>
      ))}

      {editable && (
        <datalist id="fhr18-record-people">
          {master.employees.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
      )}
    </div>
  );
}
