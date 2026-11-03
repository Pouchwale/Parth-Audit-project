// THE RANGES & LIMITS SECTION of Indexing's "Formulas, ranges & automation" tab: every range a format judges its
// readings by, grouped by format — its default (the paper's), the range in force, and its history — and, in edit mode,
// boxes to change it. Score bands (F/SYS/07's audit frequency, F/PUR/05's grade) are edited as a table of bands and saved
// as their formula. Ranges written on each sheet or line are shown, not changed. See indexing/ranges.ts.

import React, { useMemo, useState } from "react";
import { FiMinus, FiPlus, FiRotateCcw } from "react-icons/fi";
import { formatDisplayDateTime } from "../frontend/src/utils/date";
import { currentFormula, currentRange, type IndexDraft } from "./indexActions";
import { readIndexState } from "./indexState";
import { formulaSlot } from "./formulas";
import {
  bandLines,
  bandsOfFormula,
  bandsProblem,
  formulaOfBands,
  rangeDefault,
  rangeDefinitions,
  rangeProblem,
  rangeText,
  sameRange,
  type RangeDef,
  type RangeValue,
  type ScoreBand,
  type ScoreBandRange,
} from "./ranges";

export function RangesSection({
  draft,
  editing,
  onRange,
  onFormula,
}: {
  draft: IndexDraft;
  editing: boolean;
  onRange: (id: string, value: RangeValue | null) => void;
  onFormula: (slotId: string, expr: string | null) => void;
}) {
  const defs = rangeDefinitions();
  const byFormat = useMemo(() => {
    const m = new Map<string, RangeDef[]>();
    for (const d of defs) m.set(d.documentId, [...(m.get(d.documentId) ?? []), d]);
    return [...m.values()];
  }, [defs]);
  const [showTyped, setShowTyped] = useState(false);
  const changedCount = defs.filter((d) => d.kind !== "typed" && d.kind !== "scoreBands" && !sameRange(currentRange(d.id), rangeDefault(d))).length;
  const editableCount = defs.filter((d) => d.kind !== "typed").length;

  return (
    <div className="card mb-4" data-section="ranges">
      <div className="card-pad">
        <div className="flex justify-between wrap gap-2 mb-1">
          <div className="font-semibold" style={{ fontSize: 16 }}>
            Ranges &amp; limits
          </div>
          <div className="text-sm text-muted">
            {editableCount} ranges that can be changed · {changedCount} changed from the paper
          </div>
        </div>
        <p className="text-sm text-muted mb-3">
          The range each reading must be within. A reading outside it is highlighted red on the form. A changed range is
          used from the moment it is saved: the red highlight, the printed heading (e.g. "Viscosity (20.0 ± 1.0 Sec.)"),
          Mitra's fill and the insights follow it. Submitted and verified records keep the range they were signed with.
        </p>
        <label className="text-sm flex items-center gap-1 mb-2 no-print">
          <input type="checkbox" checked={showTyped} onChange={(e) => setShowTyped(e.target.checked)} /> Also show the ranges written on each sheet or line (not fixed in the format)
        </label>
        <div className="ix-scroll" style={{ maxHeight: "none" }}>
          <table className="doc-table ix-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>Format</th>
                <th>Range of</th>
                <th>Default (paper)</th>
                <th>In force now</th>
                {editing && <th className="no-print">Change to</th>}
                <th>History</th>
              </tr>
            </thead>
            <tbody>
              {byFormat.map((group) =>
                group
                  .filter((d) => showTyped || d.kind !== "typed")
                  .map((d, i, shown) => (
                    <RangeRow key={d.id} def={d} first={i === 0} span={shown.length} draft={draft} editing={editing} onRange={onRange} onFormula={onFormula} />
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RangeRow({
  def,
  first,
  span,
  draft,
  editing,
  onRange,
  onFormula,
}: {
  def: RangeDef;
  first: boolean;
  span: number;
  draft: IndexDraft;
  editing: boolean;
  onRange: (id: string, value: RangeValue | null) => void;
  onFormula: (slotId: string, expr: string | null) => void;
}) {
  const [history, setHistory] = useState(false);
  const formatCell = first ? (
    <td rowSpan={span} style={{ minWidth: 220 }}>
      <b>{def.formatNo}</b> <span className="text-muted">{def.formatName}</span>
    </td>
  ) : null;

  if (def.kind === "typed") {
    return (
      <tr data-range={def.id}>
        {formatCell}
        <td>{def.what}</td>
        <td colSpan={editing ? 3 : 2} className="text-muted">
          {def.where}
        </td>
        <td className="text-faint">—</td>
      </tr>
    );
  }
  if (def.kind === "scoreBands") return <ScoreBandRow def={def} formatCell={formatCell} draft={draft} editing={editing} onFormula={onFormula} />;

  const now = currentRange(def.id);
  const drafted = draft.ranges?.[def.id];
  const shown = drafted === undefined ? now : (drafted ?? rangeDefault(def));
  const isDefault = sameRange(now, rangeDefault(def));
  const timeline = readIndexState().ranges[def.id] ?? [];
  const problem = drafted ? rangeProblem(def, drafted) : null;

  return (
    <>
      <tr data-range={def.id}>
        {formatCell}
        <td>
          {def.what}
          {def.kind === "band" && def.columns.length > 1 && <div className="text-muted" style={{ fontSize: 11 }}>{def.columns.length} readings share this range</div>}
          {def.kind === "value" && <div className="text-muted" style={{ fontSize: 11 }}>{def.meaning}</div>}
        </td>
        <td className="text-muted">{rangeText(def, rangeDefault(def))}</td>
        <td className={isDefault ? "" : "ix-changed"}>
          <b>{rangeText(def, now)}</b>
        </td>
        {editing && (
          <td className={`no-print ${drafted !== undefined && !sameRange(shown, now) ? "ix-draft" : ""}`} style={{ minWidth: 230 }}>
            <RangeInputs def={def} value={shown} onChange={(v) => onRange(def.id, v)} />
            {problem && <div className="text-danger text-sm">{problem}</div>}
            {!sameRange(shown, rangeDefault(def)) && (
              <button className="btn btn-ghost btn-sm" onClick={() => onRange(def.id, null)}>
                <FiRotateCcw size={11} /> Default
              </button>
            )}
          </td>
        )}
        <td>
          {timeline.length > 0 ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setHistory((h) => !h)}>
              {timeline.length + 1} {history ? "▲" : "▼"}
            </button>
          ) : (
            <span className="text-faint">—</span>
          )}
        </td>
      </tr>
      {history && (
        <tr>
          <td colSpan={editing ? 5 : 4}>
            <table className="doc-table ix-table" style={{ width: "100%" }}>
              <tbody>
                {[...timeline].reverse().map((e, i) => (
                  <tr key={`${e.since}-${i}`}>
                    <td style={{ width: 200 }}>From {formatDisplayDateTime(e.since)}</td>
                    <td>
                      <b>{rangeText(def, e.value ?? rangeDefault(def))}</b>
                      {e.value === null && <span className="text-muted"> (default)</span>}
                      {i === 0 && <span className="ix-tag ix-mode-Automatic" style={{ marginLeft: 6 }}>in force</span>}
                    </td>
                    <td>Version {e.version}</td>
                    <td>{e.by}</td>
                  </tr>
                ))}
                <tr>
                  <td>From the start</td>
                  <td>
                    {rangeText(def, rangeDefault(def))} <span className="text-muted">(default)</span>
                  </td>
                  <td>Version 0</td>
                  <td>As issued</td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

/** Number boxes for a range; a box left empty is "no limit" on a band and is refused on a tolerance. */
function RangeInputs({ def, value, onChange }: { def: RangeDef; value: RangeValue; onChange: (v: RangeValue) => void }) {
  const box = (label: string, n: number | null | undefined, set: (x: number | null) => void) => (
    <label className="flex items-center gap-1 text-sm" style={{ whiteSpace: "nowrap" }}>
      {label}
      <NumberBox value={n} onChange={set} />
    </label>
  );
  if (def.kind === "band")
    return (
      <div className="flex gap-2 items-center wrap">
        {box("from", value.min, (x) => onChange({ ...value, min: x }))}
        {box("to", value.max, (x) => onChange({ ...value, max: x }))}
        {def.unit && <span className="text-muted text-sm">{def.unit}</span>}
      </div>
    );
  if (def.kind === "within")
    return (
      <div className="flex gap-2 items-center wrap">
        {box("+", value.plus, (x) => onChange({ ...value, plus: x ?? undefined }))}
        {box("−", value.minus, (x) => onChange({ ...value, minus: x ?? undefined }))}
        {def.percent && <span className="text-muted text-sm">%</span>}
      </div>
    );
  if (def.kind === "value") return <div className="flex gap-2 items-center">{box("", value.value, (x) => onChange({ ...value, value: x ?? undefined }))}{def.unit}</div>;
  return null;
}

/** A number box that lets "1." and "" be typed on the way to a number. */
function NumberBox({ value, onChange }: { value: number | null | undefined; onChange: (n: number | null) => void }) {
  const [text, setText] = useState(value === null || value === undefined ? "" : String(value));
  return (
    <input
      className="ix-cell-input"
      style={{ width: 80, minWidth: 0 }}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === "") onChange(null);
        else if (Number.isFinite(Number(t))) onChange(Number(t));
        else onChange(Number.NaN);
      }}
    />
  );
}

function ScoreBandRow({ def, formatCell, draft, editing, onFormula }: { def: ScoreBandRange; formatCell: React.ReactNode; draft: IndexDraft; editing: boolean; onFormula: (slotId: string, expr: string | null) => void }) {
  const slot = formulaSlot(def.slotId);
  const now = currentFormula(def.slotId);
  const drafted = draft.formulas[def.slotId];
  const shownExpr = drafted === undefined ? now : (drafted ?? slot?.defaultExpr ?? now);
  const nowBands = bandsOfFormula(now, def.variable);
  const shownBands = bandsOfFormula(shownExpr, def.variable);
  const defaultBands = slot ? bandsOfFormula(slot.defaultExpr, def.variable) : null;
  const lines = (b: ScoreBand[] | null) =>
    b ? (
      bandLines(b, def.whole).map((l) => (
        <div key={l.range}>
          {l.range} → <b>{l.result}</b>
        </div>
      ))
    ) : (
      <span className="text-muted">A custom formula, not a table of bands: see its formula card below.</span>
    );
  const update = (bands: ScoreBand[]) => onFormula(def.slotId, formulaOfBands(bands, def.variable));
  const problem = shownBands ? bandsProblem(shownBands) : null;

  return (
    <tr data-range={def.id}>
      {formatCell}
      <td>
        {def.what}
        <div className="text-muted" style={{ fontSize: 11 }}>
          Bands of the formula "{slot?.cell}"
        </div>
      </td>
      <td className="text-sm text-muted">{lines(defaultBands)}</td>
      <td className={`text-sm ${now !== slot?.defaultExpr ? "ix-changed" : ""}`}>{lines(nowBands)}</td>
      {editing && (
        <td className={`no-print text-sm ${drafted !== undefined && shownExpr !== now ? "ix-draft" : ""}`} style={{ minWidth: 300 }}>
          {shownBands ? (
            <>
              <BandEditor bands={shownBands} onChange={update} />
              {problem && <div className="text-danger">{problem}</div>}
              {shownExpr !== slot?.defaultExpr && (
                <button className="btn btn-ghost btn-sm" onClick={() => onFormula(def.slotId, null)}>
                  <FiRotateCcw size={11} /> Default bands
                </button>
              )}
            </>
          ) : (
            <span className="text-muted">Edit it as a formula below, or press "Use the default formula" there to edit it as bands again.</span>
          )}
        </td>
      )}
      <td className="text-muted text-sm">In the formula's history below</td>
    </tr>
  );
}

/** The bands, highest first: "at least [16] → [3 times / Year]", …, "below that → [Once / Year]". */
function BandEditor({ bands, onChange }: { bands: ScoreBand[]; onChange: (b: ScoreBand[]) => void }) {
  const steps = bands.filter((b) => b.from !== null);
  const last = bands.find((b) => b.from === null) ?? { from: null, result: "" };
  const set = (i: number, patch: Partial<ScoreBand>) => onChange([...steps.map((b, j) => (j === i ? { ...b, ...patch } : b)), last]);
  return (
    <div>
      {steps.map((b, i) => (
        <div key={i} className="flex items-center gap-1 mb-1" style={{ whiteSpace: "nowrap" }}>
          at least
          <NumberBox key={`n${i}-${steps.length}`} value={b.from} onChange={(n) => {
              // Only a number reaches the formula: an empty or half-typed box keeps the band as it was.
              if (n !== null && Number.isFinite(n)) set(i, { from: n });
            }} />→
          <input className="ix-cell-input" style={{ width: 120, minWidth: 0 }} value={b.result} onChange={(e) => set(i, { result: e.target.value })} />
          {steps.length > 1 && (
            <button className="btn btn-ghost btn-sm" title="Remove this band" onClick={() => onChange([...steps.filter((_, j) => j !== i), last])}>
              <FiMinus size={11} />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-1 mb-1">
        below that →
        <input className="ix-cell-input" style={{ width: 120, minWidth: 0 }} value={last.result} onChange={(e) => onChange([...steps, { from: null, result: e.target.value }])} />
      </div>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => {
          const lowest = steps[steps.length - 1]?.from ?? 1;
          onChange([...steps, { from: Math.max(0, (lowest as number) - 1), result: "" }, last]);
        }}
      >
        <FiPlus size={11} /> Add a band
      </button>
    </div>
  );
}
