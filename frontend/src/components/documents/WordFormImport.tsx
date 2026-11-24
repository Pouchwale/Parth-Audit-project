import React, { useMemo, useState } from "react";
import { FiCheck, FiFileText, FiUpload } from "react-icons/fi";
import type { DocumentDefinition, LogFieldType } from "../../types";
import type { PaperCell, PaperRow } from "../../data/seed/qcPaperTables";
import { Modal } from "../common/Modal";
import { documentRepository } from "../../data/repositories/documentRepository";
import { formatEditFor, saveFormatEdit } from "../../data/formatEdits";
import { readDocxFile, type WordForm } from "../../engine/wordForm/readDocx";
import { withField, withHeaderWords, withoutBox, wordFormToFormat, type WordFormat } from "../../engine/wordForm/toPaper";
import { FIELD_TYPE_LABELS } from "../../engine/formatOps";
import { logActivity } from "../../utils/activityLog";
import { todayISO } from "../../utils/date";

// A NEW FORMAT FROM A WORD FILE (the owner, 24-Nov-2026, REQUIREMENTS §324: "for new format if i upload the word file then
// same format with same spacing and all things should be come and editable in system perfectly"). The super admin picks a
// blank form saved as .docx; it is read in this browser (engine/wordForm/readDocx.ts) and made into a paper and its boxes
// (engine/wordForm/toPaper.ts). Before anything is saved the owner sees, side by side,
//   - the paper as it will be drawn, every box found shaded and named;
//   - each box found (keep it or let it stay printed paper, its name, what it takes) and the register's columns;
//   - the format's name, number, revision and module, read from the file where it says them.
// Save makes the format the way every format is kept: a document definition (documentRepository) and the format's layout
// and paper (formatEdits, the paper read by paperTableFor), as Rev of the file's own number, with who made it from which
// file. It then opens like any other format: records started, filled, printed and downloaded.

const FREQUENCY = "As Required" as const;

/** What the file says it is: the format number ("F/QC/40"), the revision, the title (its first bold line of words). */
function whatTheFileSays(form: WordForm, fileName: string): { name: string; formatNo: string; revisionNo: string } {
  const texts: { text: string; bold: boolean; centred: boolean }[] = [];
  const add = (blocks: WordForm["body"]) => {
    for (const b of blocks) {
      if (b.kind === "para") texts.push({ text: b.para.text.trim(), bold: b.para.runs.some((r) => r.bold), centred: b.para.align === "center" });
      if (b.kind === "table") for (const r of b.table.rows) for (const c of r.cells) for (const p of c.paras) texts.push({ text: p.text.trim(), bold: p.runs.some((x) => x.bold), centred: p.align === "center" });
    }
  };
  add(form.header);
  add(form.body);
  add(form.footer);
  const all = texts.map((t) => t.text).join("\n");
  const no = /\bF\s*[-/]\s*[A-Z]{2,5}\s*[-/]\s*\d{1,3}(?:\s*[-/.]?\s*[A-Z])?\b/.exec(all)?.[0]?.replace(/\s+/g, "") ?? "";
  const rev = /\bRev(?:ision)?\.?\s*(?:No\.?)?\s*[:\-–.]?\s*(\d{1,2})\b/i.exec(all)?.[1] ?? "00";
  // The title: a bold line that names a record ("... RECORD", "... REPORT", "... REGISTER", "... CHECKLIST"), else the first
  // bold centred line that is not the company's name, else the file's name.
  const titled = (t: (typeof texts)[number]) => t.bold && t.text.length >= 6 && t.text.length <= 90 && !/format\s*no|rev\.?\s*no|page|^date/i.test(t.text);
  const company = /\b(pvt|ltd|limited|private|company|industries|corporation|llp|inc)\b/i;
  const title =
    texts.find((t) => titled(t) && /\b(record|report|register|check\s*-?\s*list|checklist|log|form|sheet|certificate|plan|schedule|list|declaration|analysis|monitoring)\b/i.test(t.text) && !company.test(t.text))?.text ??
    texts.find((t) => titled(t) && t.centred && !company.test(t.text))?.text ??
    fileName.replace(/\.docx$/i, "").replace(/[_-]+/g, " ");
  return { name: title.replace(/\s+/g, " ").trim(), formatNo: no, revisionNo: rev.padStart(2, "0") };
}

/** The paper as it will be drawn, small, every box shaded and named: what the owner checks before saving. */
function PaperPreview({ made, words }: { made: WordFormat; words: { title: string; formatNo: string; revisionNo: string } }) {
  const { paper } = made;
  const lineRows: PaperRow[] = paper.lines ? Array.from({ length: Math.min(paper.lines.count, 3) }, () => ({ h: paper.lines!.h, cells: paper.lines!.cells })) : [];
  const rows = [...paper.body, ...lineRows, ...paper.foot];
  const labelOf = (key: string) => made.layout.headerFields.find((f) => f.key === key)?.label ?? made.layout.columns.find((c) => c.key === key)?.label ?? key;
  const MM = 3.2;
  const face = paper.font === "arial" ? "Arial, sans-serif" : paper.font === "times" ? '"Times New Roman", serif' : paper.font === "gothic" ? '"Century Gothic", sans-serif' : "Calibri, Carlito, sans-serif";
  const cell = (c: PaperCell, i: number, h: number) => {
    if (c.skip) return null;
    const edges = c.edges ?? "ltrb";
    const style: React.CSSProperties = {
      width: c.w * MM,
      minWidth: c.w * MM,
      height: h * MM * (c.rs ?? 1),
      borderLeft: edges.includes("l") ? "1px solid #000" : "1px solid transparent",
      borderRight: edges.includes("r") ? "1px solid #000" : "1px solid transparent",
      borderTop: edges.includes("t") ? "1px solid #000" : "1px solid transparent",
      borderBottom: edges.includes("b") ? "1px solid #000" : "1px solid transparent",
      fontWeight: c.b ? 700 : 400,
      textDecoration: c.u ? "underline" : undefined,
      fontSize: (c.pt ?? paper.pt) * 1.2,
      textAlign: c.a === "c" ? "center" : c.a === "r" ? "right" : c.a ? "justify" : "left",
      display: "flex",
      flexDirection: "column",
      justifyContent: c.vm ? "center" : "flex-start",
      background: c.box || c.col ? "#fff4c2" : c.bg,
      padding: "1px 4px",
      whiteSpace: "pre-wrap",
      overflow: "hidden",
    };
    const box = c.box ?? c.col;
    return (
      <div key={i} style={{ ...style, height: undefined, minHeight: h * MM, boxSizing: "border-box", flex: "none" }} data-preview-box={box} title={box ? `Filled in: ${labelOf(box)}` : undefined}>
        {box ? <span className="text-xs" style={{ color: "#8a5a00" }}>{labelOf(box)}</span> : c.num ? <span className="text-xs text-muted">1.</span> : c.sentence ? (
          <>
            {c.sentence.before}
            <span style={{ background: "#fff4c2", padding: "0 4px", color: "#8a5a00" }}>{labelOf(c.sentence.box)}</span>
            {c.sentence.after}
          </>
        ) : (
          c.t?.replace(/\{(title|formatNo|revisionNo)\}/g, (_, k: keyof typeof words) => words[k])
        )}
      </div>
    );
  };
  return (
    <div className="word-form-preview" data-section="word-form-preview" style={{ overflow: "auto", maxHeight: 460, background: "#fff", color: "#000", padding: 8, border: "1px solid var(--color-border)", borderRadius: 8, fontFamily: face }}>
      {rows.map((r, ri) => (
        <div key={ri} style={{ display: "flex", minHeight: r.h * MM }}>
          {r.cells.map((c, ci) => {
            const e = c.edges ?? "ltrb";
            if (c.skip) return <div key={ci} style={{ width: c.w * MM, minWidth: c.w * MM, flex: "none", borderLeft: e.includes("l") ? "1px solid #000" : "1px solid transparent", borderRight: e.includes("r") ? "1px solid #000" : "1px solid transparent" }} />;
            return cell(c, ci, r.h);
          })}
        </div>
      ))}
      {paper.lines && paper.lines.count > 3 && <p className="text-xs text-muted mt-1">… and {paper.lines.count - 3} more ruled lines of the register.</p>}
    </div>
  );
}

export function WordFormImport({ actor, onClose, onMade }: { actor: string; onClose: () => void; onMade: (doc: DocumentDefinition) => void }) {
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<WordFormat | null>(null);
  const [name, setName] = useState("");
  const [formatNo, setFormatNo] = useState("");
  const [revisionNo, setRevisionNo] = useState("00");
  const docs = documentRepository.getAll();
  const modules = useMemo(() => [...new Set(docs.map((d) => d.module))].sort(), [docs]);
  const [module, setModule] = useState("");
  const id = useMemo(() => `upl-${(name || fileName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "format"}`, [name, fileName]);

  const read = async (file: File) => {
    setError(null);
    setReading(true);
    setFileName(file.name);
    try {
      if (!/\.docx$/i.test(file.name)) throw new Error("Choose a Word file saved as .docx (in Word: File, Save As, Word Document). An old .doc must be saved as .docx first.");
      const form = await readDocxFile(await file.arrayBuffer());
      const says = whatTheFileSays(form, file.name);
      setName(says.name);
      setFormatNo(says.formatNo);
      setRevisionNo(says.revisionNo);
      const byNumber = says.formatNo && docs.find((d) => d.formatNo.replace(/\s+/g, "").split(/[-/]/)[1] === says.formatNo.split(/[-/]/)[1]);
      if (byNumber) setModule(byNumber.module);
      // (the paper's format number, revision and title follow the format's from now on)
      setMade(withHeaderWords(wordFormToFormat(form, "upl-new", file.name), says));
    } catch (e) {
      setMade(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  };

  const clash = docs.find((d) => d.formatNo.trim() && formatNo.trim() && d.formatNo.replace(/\s+/g, "").toUpperCase() === formatNo.replace(/\s+/g, "").toUpperCase());
  const idTaken = !!documentRepository.getByIdUnscoped(id) || !!formatEditFor(id);
  const refusal = !made
    ? "Choose the Word file first."
    : !name.trim()
      ? "Give the format its name."
      : !formatNo.trim()
        ? "Give the format its number (as printed on it, e.g. F/QC/40)."
        : clash
          ? `${clash.formatNo} is already “${clash.name}”. A changed version of an existing format is made in its Edit format.`
          : !module
            ? "Choose the module the format belongs to."
            : idTaken
              ? "A format of this name was already made from a Word file: give this one another name."
              : null;

  const save = () => {
    if (!made || refusal) return;
    const today = todayISO();
    const sameModule = docs.filter((d) => d.module === module);
    const department = [...sameModule.reduce((m, d) => m.set(d.department, (m.get(d.department) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? module;
    const section = sameModule.find((d) => d.section)?.section;
    const doc: DocumentDefinition = {
      id,
      kind: "log-sheet",
      name: name.trim(),
      formatNo: formatNo.trim(),
      revisionNo: revisionNo.trim() || "00",
      revisionDate: today,
      department,
      module,
      ...(section ? { section } : {}),
      frequency: FREQUENCY,
      status: "Configured",
      description: `Made from the Word file ${fileName} on ${today}: drawn as the file draws it, ${made.layout.headerFields.length} boxes to fill in${made.columns.length ? ` and a register of ${made.columns.length} columns` : ""}.`,
      sourceFile: fileName,
      schedule: { type: "as-required" },
    };
    const layout = { ...made.layout, documentId: id };
    // (the definition first: the server files the format under the definition's department)
    documentRepository.upsert(doc);
    saveFormatEdit(id, {
      revisionNo: doc.revisionNo,
      revisionDate: today,
      layout,
      paper: made.paper,
      revisions: [
        {
          id: `${id}-${Date.now().toString(36)}`,
          revisionNo: doc.revisionNo,
          revisionDate: today,
          by: actor,
          at: new Date().toISOString(),
          reason: `Made from the Word file ${fileName}`,
          summary: `made the format from ${fileName}: ${made.boxes.length} boxes${made.columns.length ? `, a register of ${made.columns.map((c) => c.label).join(", ")}` : ""}`,
        },
      ],
    });
    logActivity("Made a format from a Word file", doc.name, `${doc.formatNo} Rev ${doc.revisionNo}, from ${fileName}`, doc.id);
    onMade(doc);
  };

  const fieldRow = (key: string, label: string, type: LogFieldType, where: string, box: boolean) => (
    <tr key={key} data-found={key}>
      <td>
        <input
          className="input input-sm"
          data-field="found-label"
          value={label}
          onChange={(e) => setMade((m) => (m ? withField(m, key, { label: e.target.value }) : m))}
          aria-label={`Name of ${label}`}
        />
        <div className="text-xs text-faint">{where}</div>
      </td>
      <td>
        <select className="input input-sm" data-field="found-type" value={type} onChange={(e) => setMade((m) => (m ? withField(m, key, { type: e.target.value as LogFieldType }) : m))}>
          {(["text", "number", "date", "time", "yesno", "paragraph"] as LogFieldType[]).filter((t) => box || t !== "paragraph").map((t) => (
            <option key={t} value={t}>
              {FIELD_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </td>
      <td>
        {box && (
          <button className="btn btn-ghost btn-sm" data-action="drop-box" title="Not a box: leave it as printed paper" onClick={() => setMade((m) => (m ? withoutBox(m, key) : m))}>
            Not a box
          </button>
        )}
      </td>
    </tr>
  );

  return (
    <Modal
      title="New format from a Word file"
      onClose={onClose}
      width={1100}
      footer={
        <>
          <span className="text-xs text-muted" style={{ flex: 1 }} data-section="word-import-refusal">
            {refusal ?? `Saved as ${formatNo.trim()} Rev ${revisionNo || "00"}, made by ${actor} from ${fileName}.`}
          </span>
          <button className="btn btn-ghost btn-sm" data-action="word-import-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" data-action="word-import-save" disabled={!!refusal} onClick={save}>
            <FiCheck size={13} /> Save the new format
          </button>
        </>
      }
    >
      <div className="word-import" data-section="word-import">
        <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
          <FiUpload size={13} /> {fileName ? "Choose another Word file" : "Choose the Word file (.docx)"}
          <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-field="word-file" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
        </label>
        {fileName && (
          <span className="text-sm ml-2">
            <FiFileText size={12} /> {fileName}
          </span>
        )}
        {reading && <p className="text-sm text-muted mt-2">Reading the file…</p>}
        {error && (
          <p className="text-sm mt-2" style={{ color: "var(--color-danger)" }} data-section="word-import-error">
            {error}
          </p>
        )}
        {!made && !error && !reading && (
          <p className="text-sm text-muted mt-3">
            Choose a blank form saved from Word. It is read here, on this computer, and drawn as the file draws it: its tables, merged cells, sizes, bold, alignment and spacing. Empty cells beside or under words, and blanks written as ______, become the boxes a person fills in. A table of headings over blank lines becomes a register. You check every box before anything is saved.
          </p>
        )}
        {made && (
          <div className="word-import-grid mt-3">
            <div>
              <div className="grid" style={{ gridTemplateColumns: "1fr 140px 80px", gap: 8 }}>
                <label className="field">
                  <label>Name of the format</label>
                  <input className="input input-sm" data-field="word-name" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="field">
                  <label>Format No.</label>
                  <input className="input input-sm" data-field="word-format-no" value={formatNo} placeholder="F/QC/40" onChange={(e) => setFormatNo(e.target.value)} />
                </label>
                <label className="field">
                  <label>Rev No.</label>
                  <input className="input input-sm" data-field="word-rev" value={revisionNo} onChange={(e) => setRevisionNo(e.target.value)} />
                </label>
              </div>
              <label className="field mt-2">
                <label>Module</label>
                <select className="input input-sm" data-field="word-module" value={module} onChange={(e) => setModule(e.target.value)}>
                  <option value="">Choose…</option>
                  {modules.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-muted mt-1">Kept As Required until its frequency is set in Indexing or Master Data.</p>
              <h4 className="text-sm font-semibold mt-3">Boxes found ({made.boxes.length})</h4>
              {made.boxes.length === 0 && <p className="text-xs text-muted">No blank boxes were found: every word is printed paper.</p>}
              <table className="compact" data-section="found-boxes">
                <tbody>{made.boxes.map((b) => fieldRow(b.key, b.label, b.type, b.where, true))}</tbody>
              </table>
              {made.columns.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold mt-3">
                    Register: {made.columns.length} columns, {made.registerLines} ruled lines (a record may add more)
                  </h4>
                  <table className="compact" data-section="found-columns">
                    <tbody>{made.columns.map((c) => fieldRow(c.key, c.label, c.type, "a column of the register", false))}</tbody>
                  </table>
                </>
              )}
              {made.notes.length > 0 && (
                <ul className="text-xs text-muted mt-2" data-section="word-import-notes">
                  {made.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-1">How it will be drawn (boxes shaded)</h4>
              <PaperPreview made={made} words={{ title: name, formatNo, revisionNo }} />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
